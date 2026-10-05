import { getJob } from "@/lib/jobs";
import { decideNext, parseHistory, questionPrompt, validateQuestion } from "@/lib/interview";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  let body: { jobId?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const job = typeof body.jobId === "string" ? getJob(body.jobId) : undefined;
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  let history;
  try {
    history = parseHistory(body.history ?? []);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  // Next question is due only after the candidate answered the last one.
  if (history.length % 2 === 1) {
    return Response.json({ error: "last question is unanswered" }, { status: 400 });
  }

  const decision = decideNext(history);
  if (decision.action === "finish") return Response.json({ done: true });

  try {
    const question = await chatJson({
      label: `next_question:${job.id}:q${history.length / 2 + 1}`,
      messages: questionPrompt(job, history, decision.required),
      validate: (raw) => validateQuestion(raw, decision.required, history.length / 2),
    });
    return Response.json({ done: false, question });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "next_question.failed", { jobId: job.id, kind });
    return Response.json({ error: "The interviewer is unavailable, please retry." }, { status: 502 });
  }
}

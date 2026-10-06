import { guard, readJsonBody } from "@/lib/guard";
import { getJob } from "@/lib/jobs";
import { evaluationPrompt, parseHistory, parseLastAnswer, TOTAL_QUESTIONS, validateEvaluation } from "@/lib/interview";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as { jobId?: unknown; history?: unknown };

  const job = typeof body.jobId === "string" ? getJob(body.jobId) : undefined;
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  let history;
  try {
    history = parseHistory(body.history);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (history.length !== TOTAL_QUESTIONS * 2) {
    return Response.json({ error: "interview is not complete" }, { status: 400 });
  }

  try {
    const finalAnswer = history[history.length - 1].text; // the interview is complete, so this is the candidate's last answer
    const { evaluation, lastAnswer } = await chatJson({
      label: `evaluate:${job.id}`,
      messages: evaluationPrompt(job, history),
      validate: (raw) => ({ evaluation: validateEvaluation(raw), lastAnswer: parseLastAnswer(raw, finalAnswer) }),
    });
    return Response.json({ evaluation, lastAnswer });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "evaluate.failed", { jobId: job.id, kind });
    return Response.json({ error: "Evaluation failed, please retry." }, { status: 502 });
  }
}

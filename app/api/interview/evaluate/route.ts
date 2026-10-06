import { guard } from "@/lib/guard";
import { getJob } from "@/lib/jobs";
import { evaluationPrompt, parseHistory, TOTAL_QUESTIONS, validateEvaluation } from "@/lib/interview";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

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
    history = parseHistory(body.history);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (history.length !== TOTAL_QUESTIONS * 2) {
    return Response.json({ error: "interview is not complete" }, { status: 400 });
  }

  try {
    const evaluation = await chatJson({
      label: `evaluate:${job.id}`,
      messages: evaluationPrompt(job, history),
      validate: validateEvaluation,
    });
    return Response.json({ evaluation });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "evaluate.failed", { jobId: job.id, kind });
    return Response.json({ error: "Evaluation failed, please retry." }, { status: 502 });
  }
}

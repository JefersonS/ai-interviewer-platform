import { getJob } from "@/lib/jobs";
import { clarifyPrompt, MAX_CLARIFICATIONS, parseHistory, validateClarification } from "@/lib/interview";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  let body: { jobId?: unknown; history?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const job = typeof body.jobId === "string" ? getJob(body.jobId) : undefined;
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });

  let history;
  try {
    history = parseHistory(body.history);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  // A clarification only makes sense while a question is waiting for its answer.
  const last = history[history.length - 1];
  if (history.length % 2 === 0 || last?.role !== "interviewer") {
    return Response.json({ error: "there is no open question to clarify" }, { status: 400 });
  }
  if ((last.clarifications ?? []).length >= MAX_CLARIFICATIONS) {
    return Response.json({ error: "clarification limit reached for this question" }, { status: 400 });
  }

  try {
    const reply = await chatJson({
      label: `clarify:${job.id}:q${(history.length + 1) / 2}`,
      messages: clarifyPrompt(job, history, message),
      validate: validateClarification,
    });
    return Response.json({ reply });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "clarify.failed", { jobId: job.id, kind });
    return Response.json({ error: "The interviewer is unavailable, please retry." }, { status: 502 });
  }
}

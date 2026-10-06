import { guard, readJsonBody } from "@/lib/guard";
import { parseCandidate } from "@/lib/candidate";
import { getJob } from "@/lib/jobs";
import { decideNext, parseHistory, questionPrompt, requiredKind, validateQuestion } from "@/lib/interview";
import { fallbackQuestion } from "@/lib/fallback";
import { chatJson, isTransient, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as { jobId?: unknown; history?: unknown; candidate?: unknown };

  const job = typeof body.jobId === "string" ? getJob(body.jobId) : undefined;
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  let candidate;
  try {
    candidate = parseCandidate(body.candidate);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

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

  const decision = decideNext(history, job);
  if (decision.action === "finish") return Response.json({ done: true });

  try {
    const question = await chatJson({
      label: `next_question:${job.id}:q${history.length / 2 + 1}`,
      messages: questionPrompt(job, history, decision, candidate),
      validate: (raw) =>
        validateQuestion(raw, {
          required: requiredKind(decision),
          index: history.length / 2,
          areas: decision.newTopicAreas,
          parentArea: decision.parentArea,
          lastAnswer: history.length ? history[history.length - 1].text : undefined,
        }),
    });
    return Response.json({ done: false, question });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    // Keep the interview going with a bank question, unless the cause needs a human
    // (missing or rejected API key): hiding that would make a broken deploy look healthy.
    if (isTransient(e)) {
      log("warn", "next_question.fallback", { jobId: job.id, index: history.length / 2, kind });
      return Response.json({ done: false, question: fallbackQuestion(job, history, decision, candidate) });
    }
    log("error", "next_question.failed", { jobId: job.id, kind });
    return Response.json({ error: "The interviewer is unavailable, please retry." }, { status: 502 });
  }
}

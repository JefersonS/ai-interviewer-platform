import { expect } from "vitest";
import { POST as clarify } from "@/app/api/interview/clarify/route";
import { POST as evaluate } from "@/app/api/interview/evaluate/route";
import { POST as next } from "@/app/api/interview/next/route";
import { difficultyFor, MIN_FOLLOW_UPS, TOTAL_QUESTIONS, type Evaluation, type Turn } from "@/lib/interview";
import { getJob } from "@/lib/jobs";
import type { Scenario } from "./scenarios";

type Asked = Extract<Turn, { role: "interviewer" }>;
export type Result = { history: Turn[]; asked: Asked[]; evaluation: Evaluation; doneAfterLast: boolean };

async function call(handler: (r: Request) => Promise<Response>, body: unknown) {
  const res = await handler(new Request("http://test.local/api", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

// Plays one whole interview through the real route handlers, exactly as the browser would.
export async function runConversation(scn: Scenario): Promise<Result> {
  const history: Turn[] = [];

  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const n = await call(next, { jobId: scn.jobId, history });
    expect(n.status, `question ${i + 1}: ${JSON.stringify(n.data)}`).toBe(200);
    const q = n.data.question;
    const turn: Asked = {
      role: "interviewer",
      text: q.question,
      kind: q.kind,
      topic: q.topic,
      area: q.area,
      reasoning: q.reasoning,
      references: q.references,
      difficulty: q.difficulty,
      assessment: q.assessment,
    };
    history.push(turn);

    if (scn.clarifyAfter === i) {
      const message = "Could you rephrase that?";
      const c = await call(clarify, { jobId: scn.jobId, history, message });
      expect(c.status, JSON.stringify(c.data)).toBe(200);
      turn.clarifications = [{ ask: message, reply: c.data.reply }];
    }
    history.push({ role: "candidate", text: scn.answers[i] });
  }

  const after = await call(next, { jobId: scn.jobId, history });
  const ev = await call(evaluate, { jobId: scn.jobId, history });
  expect(ev.status, JSON.stringify(ev.data)).toBe(200);

  return {
    history,
    asked: history.filter((t): t is Asked => t.role === "interviewer"),
    evaluation: ev.data.evaluation,
    doneAfterLast: after.data.done === true,
  };
}

// Rules the code enforces, so they must hold for the real model too.
export function assertInvariants(scn: Scenario, r: Result) {
  const job = getJob(scn.jobId)!;
  const followUps = r.asked.filter((t) => t.kind === "follow_up");

  expect(r.asked).toHaveLength(TOTAL_QUESTIONS);
  expect(r.doneAfterLast).toBe(true);
  expect(followUps.length).toBeGreaterThanOrEqual(MIN_FOLLOW_UPS);
  expect(followUps.length).toBeLessThanOrEqual(TOTAL_QUESTIONS - job.focusAreas.length);
  expect(new Set(r.asked.map((t) => t.area))).toEqual(new Set(job.focusAreas));

  expect(r.asked[0].kind).toBe("new_topic");
  expect(r.asked[0].difficulty).toBe(1);
  r.asked.forEach((t, i) => {
    expect(t.difficulty).toBe(difficultyFor(i, i === 0 ? null : t.assessment));
    if (t.kind === "follow_up") {
      expect(t.references).not.toBe("");
      expect(t.area).toBe(r.asked[i - 1].area); // a follow-up stays on its parent's area
    }
    expect(t.text).not.toMatch(/\[[^\]]*\]/);
  });
  expect(new Set(r.asked.map((t) => t.text)).size).toBe(TOTAL_QUESTIONS); // no repeated question

  expect(Number.isInteger(r.evaluation.overall_score)).toBe(true);
  expect(r.evaluation.overall_score).toBeGreaterThanOrEqual(1);
  expect(r.evaluation.overall_score).toBeLessThanOrEqual(10);
  expect(r.evaluation.strengths.length).toBeGreaterThan(0);
  expect(r.evaluation.concerns.length).toBeGreaterThan(0);

  if (scn.clarifyAfter !== undefined) {
    expect(r.asked[scn.clarifyAfter].clarifications).toHaveLength(1);
    expect(r.asked[scn.clarifyAfter].clarifications![0].reply).not.toBe("");
  }
}

export function printConversation(scn: Scenario, r: Result) {
  const lines = r.asked.map(
    (t, i) => `  Q${i + 1} ${t.kind === "follow_up" ? "follow-up" : "new topic "} d${t.difficulty} [${t.area}] ${t.text}`,
  );
  console.log(`\n${scn.id} (${scn.persona}): score ${r.evaluation.overall_score}/10\n${lines.join("\n")}`);
}

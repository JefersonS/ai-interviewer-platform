import { describe, expect, it } from "vitest";
import { makeRecord } from "../tests/sessionFixture";
import { computeMetrics } from "./metrics";
import { JOBS } from "./jobs";

const job = JOBS[0];

describe("computeMetrics", () => {
  const m = computeMetrics(job, makeRecord());

  it("measures duration from start to finish", () => {
    expect(m.durationSeconds).toBe(7 * 60 + 35); // 5 s before the first question, 30 s after the last
  });

  it("computes the candidate's share of words (audio is not recorded, so by words)", () => {
    // 7 exchanges x (7 candidate words / 5 interviewer words)
    expect(m.talkRatio).toBeCloseTo(49 / 84, 3);
  });

  it("counts clarification messages toward each side", () => {
    const record = makeRecord();
    const first = record.turns[0];
    if (first.role === "interviewer") first.clarifications = [{ ask: "one two three", reply: "four five" }];
    const withClarification = computeMetrics(job, record);
    expect(withClarification.talkRatio).toBeCloseTo((49 + 3) / (84 + 5), 3);
  });

  it("averages the time from a question appearing to its answer", () => {
    expect(m.avgAnswerSeconds).toBe(20);
  });

  it("is null, not zero, for sessions saved without timestamps", () => {
    const record = makeRecord();
    record.turns = record.turns.map((t) => ({ ...t, at: undefined }));
    expect(computeMetrics(job, record).avgAnswerSeconds).toBeNull();
  });

  it("reports topic coverage, follow-ups and skills", () => {
    expect(m.coverage).toEqual({ covered: 4, total: 4 });
    expect(m.followUps).toBe(3);
    expect(m.skills).toBe(1);
  });

  it("counts ratings, including the evaluation's rating of the final answer", () => {
    // answers 1-6 rated strong via the next question; answer 7 rated adequate by the evaluation
    expect(m.ratings).toEqual({ strong: 6, adequate: 1, weak: 0 });
    expect(m.score).toBe(7);
  });

  it("averages the difficulty reached", () => {
    expect(m.avgDifficulty).toBeCloseTo((1 + 1 + 2 + 2 + 3 + 3 + 4) / 7, 1);
  });
});

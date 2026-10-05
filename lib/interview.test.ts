import { describe, expect, it } from "vitest";
import {
  decideNext,
  parseHistory,
  TOTAL_QUESTIONS,
  validateEvaluation,
  validateQuestion,
  type QuestionKind,
  type Turn,
} from "./interview";

const q = (kind: QuestionKind): Turn => ({
  role: "interviewer",
  text: "Q?",
  kind,
  topic: "t",
  reasoning: "r",
  references: kind === "follow_up" ? "something they said" : "",
});
const a: Turn = { role: "candidate", text: "An answer" };

// Builds an alternating history from a list of question kinds (each answered).
const history = (kinds: QuestionKind[]): Turn[] => kinds.flatMap((k) => [q(k), a]);

describe("decideNext", () => {
  it("opens with a new topic", () => {
    expect(decideNext([])).toEqual({ action: "ask", required: "new_topic" });
  });

  it("leaves the model free while there is slack", () => {
    expect(decideNext(history(["new_topic"]))).toEqual({ action: "ask", required: null });
  });

  it("forces follow-ups when the remaining slots equal the quota owed", () => {
    // 5 asked, 0 follow-ups -> 2 slots left, 2 owed
    const h = history(["new_topic", "new_topic", "new_topic", "new_topic", "new_topic"]);
    expect(decideNext(h)).toEqual({ action: "ask", required: "follow_up" });
  });

  it("stops forcing once the quota is met", () => {
    const h = history(["new_topic", "follow_up", "new_topic", "follow_up", "new_topic", "new_topic"]);
    expect(decideNext(h)).toEqual({ action: "ask", required: null });
  });

  it("finishes after the last question", () => {
    const h = history(Array(TOTAL_QUESTIONS).fill("new_topic"));
    expect(decideNext(h)).toEqual({ action: "finish" });
  });

  it("always yields at least 2 follow-ups when forced choices are obeyed", () => {
    let h: Turn[] = [];
    for (;;) {
      const d = decideNext(h);
      if (d.action === "finish") break;
      h = [...h, q(d.required ?? "new_topic"), a];
    }
    const followUps = h.filter((t) => t.role === "interviewer" && t.kind === "follow_up");
    expect(h.filter((t) => t.role === "interviewer")).toHaveLength(TOTAL_QUESTIONS);
    expect(followUps.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateQuestion", () => {
  const ok = { question: "Why?", kind: "new_topic", topic: "x", reasoning: "y", references: "" };

  it("accepts a valid question", () => {
    expect(validateQuestion(ok, null).question).toBe("Why?");
  });
  it("rejects a kind that violates the required kind", () => {
    expect(() => validateQuestion(ok, "follow_up")).toThrow();
  });
  it("rejects a follow-up that quotes nothing", () => {
    expect(() => validateQuestion({ ...ok, kind: "follow_up" }, null)).toThrow(/references/);
  });
  it("rejects a missing question", () => {
    expect(() => validateQuestion({ ...ok, question: " " }, null)).toThrow();
  });
});

describe("validateEvaluation", () => {
  const ok = { strengths: ["a"], concerns: ["b"], overall_score: 7.4, summary: "fine" };

  it("rounds the score", () => {
    expect(validateEvaluation(ok).overall_score).toBe(7);
  });
  it("rejects an out-of-range score", () => {
    expect(() => validateEvaluation({ ...ok, overall_score: 11 })).toThrow();
  });
  it("rejects empty strengths", () => {
    expect(() => validateEvaluation({ ...ok, strengths: [] })).toThrow();
  });
});

describe("parseHistory", () => {
  it("accepts an alternating history", () => {
    expect(parseHistory(history(["new_topic"]))).toHaveLength(2);
  });
  it("rejects turns out of order", () => {
    expect(() => parseHistory([a])).toThrow();
  });
  it("rejects oversized history", () => {
    expect(() => parseHistory(Array(40).fill(a))).toThrow();
  });
});

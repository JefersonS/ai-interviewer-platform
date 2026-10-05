import { describe, expect, it } from "vitest";
import {
  baseDifficulty,
  decideNext,
  difficultyFor,
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
  difficulty: 1,
  assessment: null,
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

describe("pacing", () => {
  it("ramps from 1 to 4 across the interview", () => {
    const ramp = Array.from({ length: TOTAL_QUESTIONS }, (_, i) => baseDifficulty(i));
    expect(ramp[0]).toBe(1);
    expect(ramp[TOTAL_QUESTIONS - 1]).toBe(4);
    expect([...ramp].sort()).toEqual(ramp); // never decreases
  });
  it("moves a level with answer quality, clamped to 1-4", () => {
    expect(difficultyFor(3, "strong")).toBe(baseDifficulty(3) + 1);
    expect(difficultyFor(3, "weak")).toBe(baseDifficulty(3) - 1);
    expect(difficultyFor(3, "adequate")).toBe(baseDifficulty(3));
    expect(difficultyFor(0, "weak")).toBe(1);
    expect(difficultyFor(TOTAL_QUESTIONS - 1, "strong")).toBe(4);
  });
});

describe("validateQuestion", () => {
  const ok = { question: "Why?", kind: "new_topic", topic: "x", reasoning: "y", references: "", difficulty: 1, assessment: null };
  const gen = { ...ok, reaction: "Nice to meet you." };

  it("generation mode prepends the reaction", () => {
    expect(validateQuestion(gen, null, 0).question).toBe("Nice to meet you. Why?");
  });
  it("generation mode requires a reaction", () => {
    expect(() => validateQuestion(ok, null, 0)).toThrow(/reaction/);
  });
  it("rejects a difficulty that breaks the pacing rule", () => {
    const mid = { ...gen, assessment: "strong", difficulty: baseDifficulty(3) };
    expect(() => validateQuestion(mid, null, 3)).toThrow(/difficulty must be/);
    expect(validateQuestion({ ...mid, difficulty: baseDifficulty(3) + 1 }, null, 3).difficulty).toBe(baseDifficulty(3) + 1);
  });
  it("requires an assessment after the first question", () => {
    expect(() => validateQuestion({ ...gen, difficulty: baseDifficulty(2) }, null, 2)).toThrow(/assessment/);
  });
  it("rejects bracketed placeholders in spoken text", () => {
    expect(() => validateQuestion({ ...gen, reaction: "Hi, I'm [Interviewer's Name]." }, null, 0)).toThrow(/placeholders/);
  });
  it("rejects an unknown assessment", () => {
    expect(() => validateQuestion({ ...ok, assessment: "great" }, null)).toThrow();
  });

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

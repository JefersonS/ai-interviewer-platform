import { describe, expect, it } from "vitest";
import {
  answerNotes,
  cleanSkills,
  translationPrompt,
  validateTranslation,
  clarifyPrompt,
  questionPrompt,
  baseDifficulty,
  evaluationPrompt,
  decideNext,
  difficultyFor,
  formatTranscript,
  MAX_CLARIFICATIONS,
  MIN_FOLLOW_UPS,
  parseHistory,
  requiredKind,
  TOTAL_QUESTIONS,
  validateClarification,
  validateEvaluation,
  validateQuestion,
  type AskDecision,
  type Gen,
  type QuestionKind,
  type Turn,
} from "./interview";
import { JOBS } from "./jobs";

const job = JOBS[0];
const [A1, A2] = job.focusAreas;

const q = (kind: QuestionKind, area = A1): Turn => ({
  role: "interviewer",
  text: "Q?",
  kind,
  topic: "t",
  area,
  reasoning: "r",
  references: kind === "follow_up" ? "something they said" : "",
  difficulty: 1,
  assessment: null,
});
const a: Turn = { role: "candidate", text: "An answer" };

// Builds an alternating history from a list of question kinds (each answered).
const history = (kinds: QuestionKind[]): Turn[] => kinds.flatMap((k) => [q(k), a]);

// Plays the whole interview, letting `choose` pick among the allowed kinds each turn.
type Chooser = (d: AskDecision, step: number) => QuestionKind;
function simulate(j: (typeof JOBS)[number], choose: Chooser) {
  let h: Turn[] = [];
  for (let step = 0; ; step++) {
    const d = decideNext(h, j);
    if (d.action === "finish") break;
    const kind = choose(d, step);
    expect(d.allowed).toContain(kind); // the policy must never offer a dead end
    const area = kind === "follow_up" ? (d.parentArea as string) : d.newTopicAreas[d.newTopicAreas.length - 1];
    h = [...h, q(kind, area), a];
  }
  return h.filter((t): t is Extract<Turn, { role: "interviewer" }> => t.role === "interviewer");
}

const STRATEGIES: Record<string, Chooser> = {
  "always follow up when allowed": (d) => (d.allowed.includes("follow_up") ? "follow_up" : "new_topic"),
  "always move on when allowed": (d) => (d.allowed.includes("new_topic") ? "new_topic" : "follow_up"),
  "alternate": (d, step) => d.allowed[step % d.allowed.length],
};

describe("decideNext", () => {
  it("opens with a new topic", () => {
    const d = decideNext([], job) as AskDecision;
    expect(d.allowed).toEqual(["new_topic"]);
    expect(d.newTopicAreas).toEqual(job.focusAreas);
  });

  it("finishes after the last question", () => {
    expect(decideNext(history(Array(TOTAL_QUESTIONS).fill("new_topic")), job)).toEqual({ action: "finish" });
  });

  it("every job has room for all its areas plus the follow-up minimum", () => {
    for (const j of JOBS) expect(j.focusAreas.length + MIN_FOLLOW_UPS).toBeLessThanOrEqual(TOTAL_QUESTIONS);
  });

  it("lets a good thread run for the whole follow-up budget, then forces the next area", () => {
    const kinds = simulate(job, STRATEGIES["always follow up when allowed"]).map((t) => t.kind);
    expect(kinds).toEqual(["new_topic", "follow_up", "follow_up", "follow_up", "new_topic", "new_topic", "new_topic"]);
  });

  it("forces an uncovered area once only enough slots remain to cover them", () => {
    const h = [...history(["new_topic"]), q("follow_up"), a, q("follow_up"), a, q("follow_up"), a];
    const d = decideNext(h, job) as AskDecision;
    expect(requiredKind(d)).toBe("new_topic");
    expect(d.newTopicAreas).toEqual(job.focusAreas.filter((x) => x !== A1));
    expect(d.followUpsLeft).toBe(0);
  });

  it("forces follow-ups when the minimum would otherwise be missed", () => {
    // Moving on every time covers all areas but leaves only 2 slots, both owed.
    const h = history(["new_topic", "new_topic", "new_topic", "new_topic", "new_topic"]).map((t, i) =>
      t.role === "interviewer" ? { ...t, area: job.focusAreas[Math.floor(i / 2) % job.focusAreas.length] } : t,
    );
    const d = decideNext(h, job) as AskDecision;
    expect(requiredKind(d)).toBe("follow_up");
  });

  for (const j of JOBS) {
    for (const [name, choose] of Object.entries(STRATEGIES)) {
      it(`${j.title}: guarantees coverage and follow-up bounds (${name})`, () => {
        const asked = simulate(j, choose);
        const followUps = asked.filter((t) => t.kind === "follow_up").length;
        expect(asked).toHaveLength(TOTAL_QUESTIONS);
        expect(new Set(asked.map((t) => t.area))).toEqual(new Set(j.focusAreas));
        expect(followUps).toBeGreaterThanOrEqual(MIN_FOLLOW_UPS);
        expect(followUps).toBeLessThanOrEqual(TOTAL_QUESTIONS - j.focusAreas.length);
      });
    }
  }
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
  const ok = { question: "Why?", kind: "new_topic", topic: "x", area: A1, reasoning: "y", references: "", difficulty: 1, assessment: null };
  const raw = { ...ok, reaction: "Nice to meet you." };
  const G = (over: Partial<Gen> = {}): Gen => ({ required: null, index: 0, areas: job.focusAreas, parentArea: null, ...over });

  it("generation mode prepends the reaction", () => {
    expect(validateQuestion(raw, G()).question).toBe("Nice to meet you. Why?");
  });
  it("generation mode requires a reaction", () => {
    expect(() => validateQuestion(ok, G())).toThrow(/reaction/);
  });
  it("rejects a difficulty that breaks the pacing rule", () => {
    const mid = { ...raw, assessment: "strong", difficulty: baseDifficulty(3) };
    expect(() => validateQuestion(mid, G({ index: 3 }))).toThrow(/difficulty must be/);
    expect(validateQuestion({ ...mid, difficulty: baseDifficulty(3) + 1 }, G({ index: 3 })).difficulty).toBe(baseDifficulty(3) + 1);
  });
  it("requires an assessment after the first question", () => {
    expect(() => validateQuestion({ ...raw, difficulty: baseDifficulty(2) }, G({ index: 2 }))).toThrow(/assessment/);
  });
  it("rejects bracketed placeholders in spoken text", () => {
    expect(() => validateQuestion({ ...raw, reaction: "Hi, I'm [Interviewer's Name]." }, G())).toThrow(/placeholders/);
  });
  it("rejects an unknown assessment", () => {
    expect(() => validateQuestion({ ...ok, assessment: "great" })).toThrow();
  });
  it("rejects a kind that violates the required kind", () => {
    expect(() => validateQuestion(raw, G({ required: "follow_up" }))).toThrow(/kind must be/);
  });
  it("rejects a new_topic area outside the allowed set", () => {
    expect(() => validateQuestion({ ...raw, area: "cooking" }, G())).toThrow(/area must be/);
    expect(() => validateQuestion(raw, G({ areas: [A2] }))).toThrow(/area must be/);
  });
  it("matches the area case-insensitively and returns the canonical name", () => {
    expect(validateQuestion({ ...raw, area: A1.toUpperCase() }, G()).area).toBe(A1);
  });
  it("makes a follow-up inherit the parent area, whatever the model said", () => {
    const fu = { ...raw, kind: "follow_up", references: "quote", assessment: "adequate", difficulty: baseDifficulty(2), area: A2 };
    expect(validateQuestion(fu, G({ index: 2, parentArea: A1 })).area).toBe(A1);
  });

  it("history mode accepts a valid question", () => {
    expect(validateQuestion(ok).question).toBe("Why?");
  });
  it("history mode tolerates a missing area (legacy sessions)", () => {
    expect(validateQuestion({ ...ok, area: undefined }).area).toBe("");
  });
  it("rejects a follow-up that quotes nothing", () => {
    expect(() => validateQuestion({ ...ok, kind: "follow_up" })).toThrow(/references/);
  });
  it("rejects a missing question", () => {
    expect(() => validateQuestion({ ...ok, question: " " })).toThrow();
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
  it("keeps the area of each question", () => {
    const parsed = parseHistory(history(["new_topic"]));
    expect(parsed[0].role === "interviewer" && parsed[0].area).toBe(A1);
  });
  it("rejects turns out of order", () => {
    expect(() => parseHistory([a])).toThrow();
  });
  it("rejects oversized history", () => {
    expect(() => parseHistory(Array(40).fill(a))).toThrow();
  });
});

describe("clarifications", () => {
  const withClar = (n: number): Turn[] => [
    { ...(q("new_topic") as Extract<Turn, { role: "interviewer" }>), clarifications: Array(n).fill({ ask: "What do you mean?", reply: "Think of a recent project." }) },
  ];

  it("keeps clarifications when parsing history", () => {
    const parsed = parseHistory(withClar(1));
    expect(parsed[0].role === "interviewer" && parsed[0].clarifications).toHaveLength(1);
  });
  it("rejects more than the per-question cap", () => {
    expect(() => parseHistory(withClar(MAX_CLARIFICATIONS + 1))).toThrow();
  });
  it("shows clarifications to the model in the transcript", () => {
    const text = formatTranscript(withClar(1));
    expect(text).toContain("asked for clarification");
    expect(text).toContain("Think of a recent project.");
  });
  it("validates the clarification reply", () => {
    expect(validateClarification({ reply: "Sure, think of a project." })).toBe("Sure, think of a project.");
    expect(() => validateClarification({ reply: "" })).toThrow();
    expect(() => validateClarification({ reply: "Hi [Name]" })).toThrow();
  });
});

describe("evaluation prompt", () => {
  const rated = (assessment: "strong" | "weak" | null, difficulty: 1 | 2 | 3 | 4): Turn[] => [
    { ...(q("new_topic") as Extract<Turn, { role: "interviewer" }>), assessment, difficulty },
    a,
  ];

  it("maps each rating to the answer it judged (the next question carries it)", () => {
    const h = [...rated(null, 1), ...rated("strong", 2), ...rated("weak", 3)];
    expect(answerNotes(h).split("\n")).toEqual([
      "answer 1 (question difficulty 1 of 4): strong",
      "answer 2 (question difficulty 2 of 4): weak",
      "answer 3 (question difficulty 3 of 4): not rated",
    ]);
  });

  it("gives the evaluator a score guide and the live ratings", () => {
    const [system, user] = evaluationPrompt(job, [...rated(null, 1), ...rated("weak", 1)]);
    expect(system.content).toContain("Score guide");
    expect(system.content).toContain("Mostly vague answers must score 4 or below");
    expect(user.content).toContain("answer 1 (question difficulty 1 of 4): weak");
  });
});

describe("language and name in prompts", () => {
  const open = decideNext([], job) as AskDecision;
  const pt = { name: "Ana", language: "pt-BR" } as const;

  it("asks for the interview in the chosen language, keeping code-checked fields in English", () => {
    const [system] = questionPrompt(job, [], open, pt);
    expect(system.content).toContain("run the whole interview in Brazilian Portuguese");
    expect(system.content).toContain('"area" must be copied verbatim from the English list');
    expect(system.content).toContain("quote the candidate's words exactly");
  });
  it("tells the model the candidate's name and how to use it", () => {
    const [system] = questionPrompt(job, [], open, pt);
    expect(system.content).toContain("The candidate's name is Ana");
  });
  it("omits the name rule when there is no name", () => {
    const [system] = questionPrompt(job, [], open, { name: "", language: "en" });
    expect(system.content).not.toContain("candidate's name is");
    expect(system.content).toContain("run the whole interview in English");
  });
  it("clarifications are written in the interview language", () => {
    const [system] = clarifyPrompt(job, history(["new_topic"]).slice(0, 1), "what?", pt);
    expect(system.content).toContain("Write the reply in Brazilian Portuguese");
  });
  it("evaluations are always written in English", () => {
    const [system] = evaluationPrompt(job, history(["new_topic"]));
    expect(system.content).toContain("ALWAYS write the evaluation in English");
  });
});

describe("evaluation translation (view only)", () => {
  const original = { strengths: ["Clear examples", "Good tradeoffs"], concerns: ["Shallow on testing"], overall_score: 7, summary: "Solid candidate." };
  const good = { strengths: ["Exemplos claros", "Bons tradeoffs"], concerns: ["Superficial em testes"], summary: "Candidato sólido." };

  it("keeps the original score, whatever the model returns", () => {
    expect(validateTranslation({ ...good, overall_score: 1 }, original).overall_score).toBe(7);
  });
  it("accepts a faithful translation", () => {
    const t = validateTranslation(good, original);
    expect(t.strengths).toEqual(good.strengths);
    expect(t.summary).toBe("Candidato sólido.");
  });
  it("rejects a translation that adds or drops items", () => {
    expect(() => validateTranslation({ ...good, strengths: ["Só um"] }, original)).toThrow(/strengths/);
    expect(() => validateTranslation({ ...good, concerns: ["a", "b"] }, original)).toThrow(/concerns/);
  });
  it("rejects empty strings and a missing summary", () => {
    expect(() => validateTranslation({ ...good, concerns: [" "] }, original)).toThrow();
    expect(() => validateTranslation({ ...good, summary: "" }, original)).toThrow(/summary/);
  });
  it("asks for the target language and sends only the text values", () => {
    const [system, user] = translationPrompt(original, "pt-BR");
    expect(system.content).toContain("into Brazilian Portuguese");
    expect(JSON.parse(user.content)).toEqual({ strengths: original.strengths, concerns: original.concerns, summary: original.summary });
  });
});

describe("skills detected", () => {
  const answer = "I built it in Node.js with Postgres and added idempotency keys.";

  it("keeps skills that appear in the answer, ignoring case, spacing and punctuation", () => {
    expect(cleanSkills(["node js", "POSTGRES", "idempotency keys"], answer)).toEqual(["node js", "POSTGRES", "idempotency keys"]);
  });
  it("drops skills the candidate never said", () => {
    expect(cleanSkills(["Postgres", "Kubernetes", "GraphQL"], answer)).toEqual(["Postgres"]);
  });
  it("removes duplicates, junk, and anything past 5", () => {
    const many = ["a1", "b2", "c3", "d4", "e5", "f6", "g7"];
    expect(cleanSkills(many)).toHaveLength(5);
    expect(cleanSkills(["Postgres", "postgres", " POSTGRES "], answer)).toEqual(["Postgres"]);
    expect(cleanSkills([42, null, "", "x", "C"], "x c 42")).toEqual([]); // too short to be meaningful
  });
  it("returns an empty list for anything that is not a list", () => {
    expect(cleanSkills(undefined, answer)).toEqual([]);
    expect(cleanSkills("Postgres", answer)).toEqual([]);
  });
  it("is applied when validating a generated question, and never on the opening", () => {
    const raw = { question: "Why?", reaction: "Thanks.", kind: "new_topic", topic: "x", area: A1, reasoning: "y", references: "", difficulty: 2, assessment: "adequate", skills: ["Postgres", "Rust"] };
    const gen = { required: null, index: 2, areas: job.focusAreas, parentArea: null, lastAnswer: answer };
    expect(validateQuestion(raw, gen).skills).toEqual(["Postgres"]);
    expect(validateQuestion({ ...raw, difficulty: 1, assessment: null }, { ...gen, index: 0 }).skills).toEqual([]);
  });
  it("a missing skills field never fails a question", () => {
    const raw = { question: "Why?", reaction: "Thanks.", kind: "new_topic", topic: "x", area: A1, reasoning: "y", references: "", difficulty: 2, assessment: "adequate" };
    const gen = { required: null, index: 2, areas: job.focusAreas, parentArea: null, lastAnswer: answer };
    expect(validateQuestion(raw, gen).skills).toEqual([]);
  });
  it("survives the round trip through saved history", () => {
    const turn = { ...(q("new_topic") as Extract<Turn, { role: "interviewer" }>), skills: ["Postgres"] };
    const parsed = parseHistory([turn]);
    expect(parsed[0].role === "interviewer" && parsed[0].skills).toEqual(["Postgres"]);
  });
});

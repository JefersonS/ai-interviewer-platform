import { decideNext, MIN_FOLLOW_UPS, TOTAL_QUESTIONS, type Assessment, type Difficulty, type LastAnswer, type QuestionKind, type Turn } from "./interview";
import type { Job } from "./jobs";

export const LEVEL_NAMES: Record<Difficulty, string> = { 1: "Warm-up", 2: "Core", 3: "Advanced", 4: "Expert" };

type InterviewerTurn = Extract<Turn, { role: "interviewer" }>;

export type Step = {
  n: number;
  kind: QuestionKind;
  area: string;
  difficulty: Difficulty;
  levelName: string;
  assessment: Assessment | null; // how the answer BEFORE this question was rated
  rating: Assessment | null | undefined; // how the answer TO this question was rated; undefined = not rated (yet)
  reasoning: string;
  quote: string;
  fromBank: boolean;
};

export type PanelState = {
  asked: number;
  total: number;
  complete: boolean; // every question has been answered
  steps: Step[]; // one per question, for the question-by-question view
  // The question on screen and why it was chosen. Null before the first question.
  current: null | {
    n: number;
    kind: QuestionKind;
    area: string;
    difficulty: Difficulty;
    levelName: string;
    assessment: Assessment | null; // how the previous answer was rated
    reasoning: string; // the model's one-line note
    quote: string; // the words a follow-up builds on
    fromBank: boolean; // true when the model failed and a fixed question was used
  };
  areas: { name: string; asked: number; status: "current" | "covered" | "gap" }[];
  followUps: { used: number; budget: number; min: number };
  trail: { n: number; difficulty: Difficulty; kind: QuestionKind; rating: Assessment | null | undefined }[]; // rating of the answer to question n; undefined = not answered yet or not rated
  skills: string[];
  nextRule: string; // what the code will allow for the next question, and why
};

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// lastAnswer is the evaluation's rating of the final answer, which no later question can carry.
export function panelState(job: Job, turns: Turn[], lastAnswer?: LastAnswer): PanelState {
  const asked = turns.filter((t): t is InterviewerTurn => t.role === "interviewer");
  const last = asked[asked.length - 1];
  const complete = asked.length >= TOTAL_QUESTIONS && turns[turns.length - 1]?.role === "candidate";
  const ratingOf = (i: number): Assessment | null | undefined =>
    asked[i + 1] ? asked[i + 1].assessment : i === asked.length - 1 && complete ? lastAnswer?.rating : undefined;
  const covered = new Set(asked.map((t) => t.area));
  const uncovered = job.focusAreas.filter((a) => !covered.has(a));

  const skills: string[] = [];
  for (const t of asked) {
    for (const skill of t.skills ?? []) if (!skills.some((s) => squash(s) === squash(skill))) skills.push(skill);
  }

  if (complete) {
    for (const skill of lastAnswer?.skills ?? []) if (!skills.some((s) => squash(s) === squash(skill))) skills.push(skill);
  }

  return {
    asked: asked.length,
    total: TOTAL_QUESTIONS,
    complete,
    steps: asked.map((t, i) => ({
      n: i + 1,
      kind: t.kind,
      area: t.area,
      difficulty: t.difficulty,
      levelName: LEVEL_NAMES[t.difficulty],
      assessment: t.assessment,
      rating: ratingOf(i),
      reasoning: t.reasoning,
      quote: t.references,
      fromBank: t.source === "fallback",
    })),
    current: last
      ? {
          n: asked.length,
          kind: last.kind,
          area: last.area,
          difficulty: last.difficulty,
          levelName: LEVEL_NAMES[last.difficulty],
          assessment: last.assessment,
          reasoning: last.reasoning,
          quote: last.references,
          fromBank: last.source === "fallback",
        }
      : null,
    areas: job.focusAreas.map((name) => ({
      name,
      asked: asked.filter((t) => t.area === name).length,
      // once every question is answered nothing is "current" any more
      status: last?.area === name && !complete ? "current" : covered.has(name) ? "covered" : "gap",
    })),
    followUps: { used: asked.filter((t) => t.kind === "follow_up").length, budget: TOTAL_QUESTIONS - job.focusAreas.length, min: MIN_FOLLOW_UPS },
    // The rating of answer n is stored on question n+1, because the model rates it while writing that question.
    trail: asked.map((t, i) => ({ n: i + 1, difficulty: t.difficulty, kind: t.kind, rating: ratingOf(i) })),
    skills,
    nextRule: nextRule(job, turns, uncovered, complete, lastAnswer),
  };
}

function nextRule(job: Job, turns: Turn[], uncovered: string[], complete: boolean, lastAnswer?: LastAnswer): string {
  if (!turns.length) return "Waiting for the first question.";
  if (complete) {
    return lastAnswer
      ? "Interview complete. The final answer has been rated and the evaluation is ready."
      : "Interview complete. Rating the final answer and writing the evaluation...";
  }
  const d = decideNext(turns, job);
  if (d.action === "finish") return "This is the last question. After the answer, it is rated and the evaluation is written.";

  if (d.allowed.length === 1 && d.allowed[0] === "follow_up") {
    return `The next question must be a follow-up, otherwise the minimum of ${MIN_FOLLOW_UPS} follow-ups would be missed.`;
  }
  if (d.allowed.length === 1) {
    return uncovered.length
      ? `No follow-up slots left. The next question must open an uncovered area: ${uncovered.join(", ")}.`
      : "No follow-up slots left. The next question must move on to a new question.";
  }
  const left = d.followUpsLeft;
  return `Free choice. It can follow up (${left} follow-up${left === 1 ? "" : "s"} still affordable) or open a new area (${(uncovered.length ? uncovered : job.focusAreas).join(", ")}).`;
}

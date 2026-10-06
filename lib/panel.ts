import { decideNext, MIN_FOLLOW_UPS, TOTAL_QUESTIONS, type Assessment, type Difficulty, type QuestionKind, type Turn } from "./interview";
import type { Job } from "./jobs";

export const LEVEL_NAMES: Record<Difficulty, string> = { 1: "Warm-up", 2: "Core", 3: "Advanced", 4: "Expert" };

type InterviewerTurn = Extract<Turn, { role: "interviewer" }>;

export type PanelState = {
  asked: number;
  total: number;
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

export function panelState(job: Job, turns: Turn[]): PanelState {
  const asked = turns.filter((t): t is InterviewerTurn => t.role === "interviewer");
  const last = asked[asked.length - 1];
  const covered = new Set(asked.map((t) => t.area));
  const uncovered = job.focusAreas.filter((a) => !covered.has(a));

  const skills: string[] = [];
  for (const t of asked) {
    for (const skill of t.skills ?? []) if (!skills.some((s) => squash(s) === squash(skill))) skills.push(skill);
  }

  return {
    asked: asked.length,
    total: TOTAL_QUESTIONS,
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
      status: last?.area === name ? "current" : covered.has(name) ? "covered" : "gap",
    })),
    followUps: { used: asked.filter((t) => t.kind === "follow_up").length, budget: TOTAL_QUESTIONS - job.focusAreas.length, min: MIN_FOLLOW_UPS },
    // The rating of answer n is stored on question n+1, because the model rates it while writing that question.
    trail: asked.map((t, i) => ({ n: i + 1, difficulty: t.difficulty, kind: t.kind, rating: asked[i + 1] ? asked[i + 1].assessment : undefined })),
    skills,
    nextRule: nextRule(job, turns, uncovered),
  };
}

function nextRule(job: Job, turns: Turn[], uncovered: string[]): string {
  if (!turns.length) return "Waiting for the first question.";
  const d = decideNext(turns, job);
  if (d.action === "finish") return "That was the last question.";

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

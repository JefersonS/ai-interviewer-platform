import { parseCandidate, type Candidate } from "./candidate";
import { cleanSkills, parseHistory, TOTAL_QUESTIONS, validateEvaluation, type Assessment, type Evaluation, type LastAnswer, type Turn } from "./interview";
import { getJob } from "./jobs";
import type { Lang } from "./languages";
import { isUuid } from "./owner";

// A finished interview as saved to the database.
export type SessionRecord = {
  id: string;
  jobId: string;
  candidate: Candidate;
  startedAt: number; // epoch ms
  finishedAt: number;
  turns: Turn[]; // may carry `at` timestamps
  evaluation: Evaluation;
  lastAnswer?: LastAnswer;
};

export type Metrics = {
  durationSeconds: number;
  talkRatio: number; // candidate's share of all words spoken, 0 to 1 (by words: audio is not recorded)
  avgAnswerSeconds: number | null; // question shown to answer sent; null for sessions without timestamps
  coverage: { covered: number; total: number };
  score: number;
  ratings: Record<Assessment, number>; // how many answers were rated strong, adequate, weak
  avgDifficulty: number;
  followUps: number;
  skills: number;
};

// What the history list shows, without the transcript.
export type SessionListItem = {
  id: string;
  jobId: string;
  candidateName: string;
  language: Lang;
  finishedAt: number;
  score: number;
  metrics: Metrics;
};

const DAY = 86_400_000;

// Checks what the browser sends when it saves a finished interview.
export function parseSessionRecord(raw: unknown): SessionRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!isUuid(r.id)) throw new Error("id must be a UUID");
  const job = typeof r.jobId === "string" ? getJob(r.jobId) : undefined;
  if (!job) throw new Error("unknown job");

  const startedAt = Number(r.startedAt);
  const finishedAt = Number(r.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || startedAt < 1_600_000_000_000) throw new Error("invalid timestamps");
  if (finishedAt < startedAt || finishedAt - startedAt > 30 * DAY || finishedAt > Date.now() + DAY) throw new Error("invalid timestamps");

  const turns = parseHistory(r.turns);
  if (turns.length !== TOTAL_QUESTIONS * 2) throw new Error("interview is not complete");

  let lastAnswer: LastAnswer | undefined;
  const la = r.lastAnswer as Record<string, unknown> | undefined;
  if (la && ["strong", "adequate", "weak"].includes(la.rating as string)) {
    lastAnswer = { rating: la.rating as Assessment, skills: cleanSkills(la.skills) };
  }

  return {
    id: r.id,
    jobId: job.id,
    candidate: parseCandidate(r.candidate),
    startedAt,
    finishedAt,
    turns,
    evaluation: validateEvaluation(r.evaluation),
    ...(lastAnswer ? { lastAnswer } : {}),
  };
}

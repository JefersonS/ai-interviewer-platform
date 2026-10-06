import type { SessionRecord } from "@/lib/history";
import type { QuestionKind, Turn } from "@/lib/interview";
import { JOBS } from "@/lib/jobs";

export const BASE_TIME = 1_700_000_000_000;

// A complete, valid interview: 7 questions (3 follow-ups, all 4 areas), each answered 20 s after
// it appeared, 5 interviewer words and 7 candidate words per exchange.
export function makeRecord(over: Partial<SessionRecord> = {}): SessionRecord {
  const job = JOBS.find((j) => j.id === over.jobId) ?? JOBS[0];
  const kinds: QuestionKind[] = ["new_topic", "follow_up", "new_topic", "new_topic", "follow_up", "new_topic", "follow_up"];
  const areaIndex = [0, 0, 1, 2, 2, 3, 3];
  const turns: Turn[] = [];
  kinds.forEach((kind, i) => {
    const at = BASE_TIME + i * 60_000;
    turns.push({
      role: "interviewer",
      text: "Tell me about it please",
      kind,
      topic: "t",
      area: job.focusAreas[areaIndex[i]],
      reasoning: `reasoning ${i + 1}`,
      references: kind === "follow_up" ? "a quote" : "",
      difficulty: (Math.min(4, 1 + Math.floor((i * 3) / 6)) as 1 | 2 | 3 | 4),
      assessment: i === 0 ? null : "strong",
      skills: i === 1 ? ["Postgres"] : [],
      at,
    });
    turns.push({ role: "candidate", text: "An answer with several words in it", at: at + 20_000 });
  });
  return {
    id: crypto.randomUUID(),
    jobId: job.id,
    candidate: { name: "Ana", language: "en" },
    startedAt: BASE_TIME - 5_000,
    finishedAt: BASE_TIME + 7 * 60_000 + 30_000,
    turns,
    evaluation: { strengths: ["Clear examples"], concerns: ["Shallow on testing"], overall_score: 7, summary: "Solid." },
    lastAnswer: { rating: "adequate", skills: [] },
    ...over,
  };
}

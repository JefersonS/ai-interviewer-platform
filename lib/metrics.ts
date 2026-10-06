import type { Metrics, SessionRecord } from "./history";
import type { Job } from "./jobs";
import { panelState } from "./panel";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

// Per-session numbers shown on the history page. Everything is derived from the saved
// turns, so it can be recomputed any time.
export function computeMetrics(job: Job, record: SessionRecord): Metrics {
  let candidateWords = 0;
  let interviewerWords = 0;
  for (const turn of record.turns) {
    if (turn.role === "candidate") {
      candidateWords += words(turn.text);
      continue;
    }
    interviewerWords += words(turn.text);
    for (const c of turn.clarifications ?? []) {
      candidateWords += words(c.ask);
      interviewerWords += words(c.reply);
    }
  }

  // Time from a question appearing to its answer being sent (includes the voice reading it).
  const gaps: number[] = [];
  record.turns.forEach((turn, i) => {
    const asked = record.turns[i - 1];
    if (turn.role === "candidate" && asked?.role === "interviewer" && turn.at !== undefined && asked.at !== undefined && turn.at > asked.at) {
      gaps.push((turn.at - asked.at) / 1000);
    }
  });

  const panel = panelState(job, record.turns, record.lastAnswer);
  const ratings = { strong: 0, adequate: 0, weak: 0 };
  for (const step of panel.trail) if (step.rating) ratings[step.rating]++;

  return {
    durationSeconds: Math.round((record.finishedAt - record.startedAt) / 1000),
    talkRatio: candidateWords + interviewerWords ? round(candidateWords / (candidateWords + interviewerWords), 3) : 0,
    avgAnswerSeconds: gaps.length ? round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    coverage: { covered: panel.areas.filter((a) => a.asked > 0).length, total: panel.areas.length },
    score: record.evaluation.overall_score,
    ratings,
    avgDifficulty: panel.trail.length ? round(panel.trail.reduce((sum, s) => sum + s.difficulty, 0) / panel.trail.length) : 0,
    followUps: panel.followUps.used,
    skills: panel.skills.length,
  };
}

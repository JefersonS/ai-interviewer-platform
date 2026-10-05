import { describe, expect, it } from "vitest";
import { fallbackQuestion } from "./fallback";
import { decideNext, difficultyFor, MIN_FOLLOW_UPS, TOTAL_QUESTIONS, type AskDecision, type Turn } from "./interview";
import { JOBS } from "./jobs";
import { bankQuestion, QUESTION_BANK } from "./questions";

describe("question bank", () => {
  it("covers exactly each job's focus areas, with 4 distinct questions per area", () => {
    for (const job of JOBS) {
      const bank = QUESTION_BANK[job.id];
      expect(Object.keys(bank).sort()).toEqual([...job.focusAreas].sort());
      for (const area of job.focusAreas) {
        const qs = bank[area];
        expect(qs).toHaveLength(4);
        expect(new Set(qs).size).toBe(4);
        qs.forEach((q) => {
          expect(q.length).toBeGreaterThan(20);
          expect(q).not.toMatch(/\[[^\]]*\]/);
        });
      }
    }
  });

  it("orders variants by closeness to the wanted difficulty", () => {
    const [area] = JOBS[0].focusAreas;
    const bank = QUESTION_BANK[JOBS[0].id][area];
    expect(bankQuestion(JOBS[0].id, area, 3)).toEqual([bank[2], bank[1], bank[3], bank[0]]);
    expect(bankQuestion(JOBS[0].id, area, 1)[0]).toBe(bank[0]);
  });
});

describe("fallbackQuestion", () => {
  const answer: Turn = { role: "candidate", text: 'I used "Redis" for caching.\nIt cut latency a lot in our checkout service for peak days.' };

  for (const job of JOBS) {
    it(`${job.title}: an interview made only of fallback questions still satisfies the policy`, () => {
      let h: Turn[] = [];
      for (;;) {
        const d = decideNext(h, job);
        if (d.action === "finish") break;
        const q = fallbackQuestion(job, h, d as AskDecision);
        expect(d.allowed).toContain(q.kind);
        h = [
          ...h,
          {
            role: "interviewer",
            text: q.question,
            kind: q.kind,
            topic: q.topic,
            area: q.area,
            reasoning: q.reasoning,
            references: q.references,
            difficulty: q.difficulty,
            assessment: q.assessment,
            source: q.source,
          },
          answer,
        ];
      }
      const asked = h.filter((t): t is Extract<Turn, { role: "interviewer" }> => t.role === "interviewer");
      const followUps = asked.filter((t) => t.kind === "follow_up");

      expect(asked).toHaveLength(TOTAL_QUESTIONS);
      expect(new Set(asked.map((t) => t.area))).toEqual(new Set(job.focusAreas));
      expect(followUps.length).toBeGreaterThanOrEqual(MIN_FOLLOW_UPS);
      expect(new Set(asked.map((t) => t.text)).size).toBe(TOTAL_QUESTIONS);
      asked.forEach((t, i) => {
        expect(t.source).toBe("fallback");
        expect(t.difficulty).toBe(difficultyFor(i, null));
        expect(t.text).not.toMatch(/\[[^\]]*\]/);
      });
      followUps.forEach((t) => {
        expect(t.references).not.toBe("");
        // same words, in order (the quote collapses whitespace and drops double quotes)
        expect(answer.text.replace(/"/g, "").split(/\s+/).join(" ")).toContain(t.references);
        expect(t.text).toContain(t.references);
      });
    });
  }

  it("greets on the opening question", () => {
    const job = JOBS[0];
    const q = fallbackQuestion(job, [], decideNext([], job) as AskDecision);
    expect(q.question).toMatch(/^Hi, I'm your AI interviewer/);
    expect(q.difficulty).toBe(1);
    expect(q.assessment).toBeNull();
  });
});

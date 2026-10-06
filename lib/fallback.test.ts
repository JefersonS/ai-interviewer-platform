import { describe, expect, it } from "vitest";
import type { Candidate } from "./candidate";
import { fallbackQuestion } from "./fallback";
import { decideNext, difficultyFor, MIN_FOLLOW_UPS, TOTAL_QUESTIONS, type AskDecision, type Turn } from "./interview";
import { JOBS } from "./jobs";
import { LANG_CODES } from "./languages";
import { bankQuestion, QUESTION_BANKS } from "./questions";

describe("question banks", () => {
  for (const lang of LANG_CODES) {
    it(`${lang}: covers exactly each job's focus areas, with 4 distinct questions per area`, () => {
      for (const job of JOBS) {
        const bank = QUESTION_BANKS[lang][job.id];
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
  }

  it("the Portuguese bank is actually translated, not a copy of the English one", () => {
    for (const job of JOBS) {
      for (const area of job.focusAreas) {
        QUESTION_BANKS["pt-BR"][job.id][area].forEach((q, i) => {
          expect(q).not.toBe(QUESTION_BANKS.en[job.id][area][i]);
        });
      }
    }
  });

  it("orders variants by closeness to the wanted difficulty", () => {
    const [area] = JOBS[0].focusAreas;
    const bank = QUESTION_BANKS.en[JOBS[0].id][area];
    expect(bankQuestion(JOBS[0].id, area, 3)).toEqual([bank[2], bank[1], bank[3], bank[0]]);
    expect(bankQuestion(JOBS[0].id, area, 1)[0]).toBe(bank[0]);
  });
});

describe("fallbackQuestion", () => {
  const answers: Record<string, string> = {
    en: 'I used "Redis" for caching.\nIt cut latency a lot in our checkout service for peak days.',
    "pt-BR": 'Usei "Redis" para cache.\nIsso reduziu bastante a latência no nosso serviço de checkout nos dias de pico.',
  };

  for (const lang of LANG_CODES) {
    for (const job of JOBS) {
      it(`${job.title} (${lang}): an interview made only of fallback questions still satisfies the policy`, () => {
        const candidate: Candidate = { name: "Ana", language: lang };
        const answer: Turn = { role: "candidate", text: answers[lang] };
        let h: Turn[] = [];
        for (;;) {
          const d = decideNext(h, job);
          if (d.action === "finish") break;
          const q = fallbackQuestion(job, h, d as AskDecision, candidate);
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
  }

  it("greets by name in the candidate's language on the opening question", () => {
    const job = JOBS[0];
    const open = decideNext([], job) as AskDecision;
    const en = fallbackQuestion(job, [], open, { name: "Ana", language: "en" });
    const pt = fallbackQuestion(job, [], open, { name: "Ana", language: "pt-BR" });
    expect(en.question).toMatch(/^Hi Ana, I'm your AI interviewer/);
    expect(pt.question).toMatch(/^Olá, Ana, eu sou seu entrevistador de IA/);
    expect(en.difficulty).toBe(1);
    expect(en.assessment).toBeNull();
  });

  it("greets without a name when there is none", () => {
    const job = JOBS[0];
    const q = fallbackQuestion(job, [], decideNext([], job) as AskDecision, { name: "", language: "en" });
    expect(q.question).toMatch(/^Hi, I'm your AI interviewer/);
  });
});

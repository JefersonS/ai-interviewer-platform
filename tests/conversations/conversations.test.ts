import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseDifficulty, difficultyFor, TOTAL_QUESTIONS } from "@/lib/interview";
import { LANGUAGES } from "@/lib/languages";
import { fakeModel } from "./fakeModel";
import { assertInvariants, runConversation } from "./run";
import { SCENARIOS } from "./scenarios";

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

// Pacing for a candidate rated strong (or weak) on every answer, derived from the rule.
const trajectory = (rating: "strong" | "weak") =>
  Array.from({ length: TOTAL_QUESTIONS }, (_, i) => difficultyFor(i, i === 0 ? null : rating));

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});
afterEach(() => vi.unstubAllGlobals());

describe("full conversations (offline fake model)", () => {
  it("sanity: the rule yields the trajectories the assertions rely on", () => {
    expect(trajectory("strong")).toEqual([1, 2, 3, 3, 4, 4, 4]);
    expect(trajectory("weak")).toEqual([1, 1, 1, 1, 2, 2, 3]);
    expect(baseDifficulty(0)).toBe(1);
  });

  for (const scn of SCENARIOS) {
    it(scn.id, async () => {
      const model = fakeModel(scn);
      vi.stubGlobal("fetch", model.fetchImpl);

      const r = await runConversation(scn);
      assertInvariants(scn, r);

      // The chosen language and the candidate's name must reach every question prompt.
      if (scn.candidate) {
        const prompts = model.questionPrompts();
        expect(prompts.length).toBeGreaterThan(0);
        for (const p of prompts) {
          expect(p).toContain(`run the whole interview in ${LANGUAGES[scn.candidate.language].promptName}`);
          expect(p).toContain(`name is ${scn.candidate.name}`);
        }
      }

      // The fake model reports one real word and one invented skill: only the real one may survive.
      const detected = r.asked.flatMap((t) => t.skills ?? []);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some((k) => k.includes("Invented"))).toBe(false);

      // The evaluation call rates the final answer; an invented skill from the fake must be dropped.
      expect(r.lastAnswer?.rating).toBe(scn.persona);
      const finalWord = scn.answers[scn.answers.length - 1].split(/\W+/).find((w) => w.length > 4);
      if (finalWord) expect(r.lastAnswer?.skills.length).toBeGreaterThan(0); // the fake only reports a word it can find
      expect(r.lastAnswer?.skills.some((k) => k.includes("Invented"))).toBe(false);

      expect(r.asked.map((t) => t.difficulty)).toEqual(trajectory(scn.persona));

      // A follow-up must quote the answer it follows.
      r.asked.forEach((t, i) => {
        if (t.kind === "follow_up") expect(scn.answers[i - 1]).toContain(t.references);
      });

      // Eager models spend the whole follow-up budget; lazy ones only the required minimum.
      const followUps = r.asked.filter((t) => t.kind === "follow_up").length;
      expect(followUps).toBe(scn.eager ? 3 : 2);

      // 7 questions + evaluation, plus one clarification and one repair retry where scripted.
      const expectedCalls = TOTAL_QUESTIONS + 1 + (scn.clarifyAfter !== undefined ? 1 : 0) + (scn.flakyAtQuestion !== undefined ? 1 : 0);
      expect(model.calls()).toBe(expectedCalls);
    });
  }
});

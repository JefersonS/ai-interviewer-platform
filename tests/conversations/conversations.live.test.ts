import { writeFileSync } from "node:fs";
import { afterAll, describe, it } from "vitest";
import { assertInvariants, printConversation, runConversation } from "./run";
import { SCENARIOS } from "./scenarios";

// Calls the real model through OpenRouter (costs a little, takes a few minutes).
// Run with: npm run test:live          one conversation: npm run test:live -- -t backend-strong
// Vitest hides console output of passing tests, so every run is also saved to
// tests/conversations/live-results.json (git-ignored) for reading afterwards.
const hasKey = Boolean(process.env.OPENROUTER_API_KEY);
if (!hasKey) console.warn("OPENROUTER_API_KEY is not set (checked .env.local): live conversations are skipped.");

const results: unknown[] = [];

afterAll(() => {
  if (!results.length) return;
  const out = { ranAt: new Date().toISOString(), model: process.env.OPENROUTER_MODEL ?? "default", conversations: results };
  writeFileSync("tests/conversations/live-results.json", JSON.stringify(out, null, 2));
});

describe.skipIf(!hasKey)("full conversations (live model)", () => {
  for (const scn of SCENARIOS) {
    it(
      scn.id,
      async () => {
        const result = await runConversation(scn);
        printConversation(scn, result);
        results.push({
          id: scn.id,
          persona: scn.persona,
          score: result.evaluation.overall_score,
          evaluation: result.evaluation,
          questions: result.asked.map((t, i) => ({
            n: i + 1,
            kind: t.kind,
            area: t.area,
            difficulty: t.difficulty,
            assessment: t.assessment,
            source: t.source ?? "model", // "fallback" means the model failed and the bank was used
            text: t.text,
            answer: scn.answers[i],
          })),
        });
        assertInvariants(scn, result);
      },
      240_000,
    );
  }
});

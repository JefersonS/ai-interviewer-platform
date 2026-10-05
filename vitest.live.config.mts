import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same key source as `next dev`. Variables already set in the shell win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the live tests report that and skip.
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["**/*.live.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 240_000,
    fileParallelism: false, // one conversation at a time keeps us under rate limits
  },
});

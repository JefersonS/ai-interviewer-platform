import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Live tests call the real model; they only run via `npm run test:live`.
  test: { exclude: [...configDefaults.exclude, "**/*.live.test.ts"] },
});

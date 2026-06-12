import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Resolve the `@/*` path alias (matches tsconfig.json) without a plugin.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // DB-integration tests share the same personaSource table; running files
    // sequentially avoids race conditions between concurrent writers.
    fileParallelism: false,
    // Feature worktrees live under .claude/worktrees/ — without this, a run
    // from the main checkout sweeps their copies of every test file.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});

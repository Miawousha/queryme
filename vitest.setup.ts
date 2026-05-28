import "@testing-library/jest-dom/vitest";
import { http, passthrough } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so that integration tests that touch the real DB (e.g.
// persona-source happy-path) pick up POSTGRES_URL. This is a lightweight
// inline parse — no dotenv dependency required.
const envLocalPath = resolve(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    // Only set if not already present — real env vars take priority.
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Note: `msw` is kept as a devDependency because it's a runtime requirement
// of `@ai-sdk/provider-utils/test` (imported via `ai/test`). Removing it
// breaks tests that use AI SDK test helpers (e.g. tests/lib/answerer.test.ts).

/**
 * Shared MSW server for tests that mock outbound HTTP. Tests register
 * per-case handlers via `mswServer.use(...)`. Unhandled requests fail loudly
 * to catch accidental network calls in tests.
 *
 * Neon (Postgres over HTTP) is explicitly passthroughed so integration tests
 * can reach the real DB without tripping the unhandled-request guard.
 */
export const mswServer = setupServer(
  http.get("https://*.neon.tech/*", () => passthrough()),
  http.post("https://*.neon.tech/*", () => passthrough()),
);
beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

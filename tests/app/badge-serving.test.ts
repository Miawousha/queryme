import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import nextConfig from "@/next.config";

// repo root, two levels up from tests/app/. Resolved from the test file's own
// dir (not `new URL("../..", import.meta.url)`): under Vite's vitest the latter
// walks past the served root and yields an http: URL that fileURLToPath()
// rejects (same quirk documented in tests/scripts/build-badge-output.test.ts).
const root = resolve(import.meta.dirname, "../..");

describe("badge serving", () => {
  it("middleware matcher excludes /badge so the image is public", () => {
    const src = readFileSync(`${root}/middleware.ts`, "utf8");
    expect(src).toMatch(/matcher[\s\S]*badge/);
  });

  it("badge assets get a long immutable cache header", async () => {
    const headers = await nextConfig.headers!();
    const badge = headers.find((h) => h.source.startsWith("/badge"));
    expect(badge).toBeDefined();
    expect(
      badge!.headers.some((x) => x.key === "Cache-Control" && x.value.includes("immutable")),
    ).toBe(true);
  });
});

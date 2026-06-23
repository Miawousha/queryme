import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// repo root, two levels up from tests/scripts/. Resolved from the test file's
// own dir (not `new URL("../..", import.meta.url)`): under Vite's vitest the
// latter walks past the served root and yields an http: URL that
// fileURLToPath() rejects.
const root = resolve(import.meta.dirname, "../..");
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("generated badge assets", () => {
  it("ships app/icon.svg", () => {
    expect(existsSync(`${root}/app/icon.svg`)).toBe(true);
  });

  for (const f of [
    "queritae-ink.png",
    "queritae-ink@2x.png",
    "queritae-white.png",
    "queritae-white@2x.png",
  ]) {
    it(`${f} exists and is a valid png`, () => {
      const p = `${root}/public/badge/${f}`;
      expect(existsSync(p)).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 4).equals(PNG_SIG)).toBe(true);
    });
  }
});

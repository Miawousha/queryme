/**
 * Byte-identity guarantee: the LLM-facing prompt (header + KB text) must not
 * change as a side effect of the headless-persona refactor. If this test
 * fails, the refactor broke something downstream of the prompt.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("LLM-facing prompt is byte-identical to pre-migration baseline", () => {
  it("matches tests/fixtures/prompt-golden-pre-migration.txt", async () => {
    const root = process.cwd();
    const kb = await loadKb(path.join(root, "kb"), "en");
    const kbText = assemblePublicKbText(kb);
    const parts = buildSystemPromptParts({ kbText });
    const actual = parts.map((p) => p.text).join("\n\n");

    const goldenPath = path.join(
      root,
      "tests/fixtures/prompt-golden-pre-migration.txt",
    );
    const expected = fs.readFileSync(goldenPath, "utf8");

    expect(actual).toBe(expected);
  });
});

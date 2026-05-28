/**
 * Captures the EXACT bytes the LLM sees today as system prompt:
 *   header (prompts/system.md, trimmed) + "\n\n" + assembled public KB text.
 * Writes to tests/fixtures/prompt-golden-pre-migration.txt.
 * Run once before the headless-persona refactor; the file is committed and
 * subsequent runs of the golden-master test must match it byte-for-byte.
 */
import fs from "node:fs";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { buildSystemPromptParts } from "@/lib/prompts";

async function main() {
  const root = process.cwd();
  const kb = await loadKb(path.join(root, "kb"), "en");
  const kbText = assemblePublicKbText(kb);
  const parts = buildSystemPromptParts({ kbText });
  const full = parts.map((p) => p.text).join("\n\n");
  const out = path.join(root, "tests/fixtures/prompt-golden-pre-migration.txt");
  fs.writeFileSync(out, full, "utf8");
  process.stdout.write(`golden prompt → ${out} (${full.length} bytes)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

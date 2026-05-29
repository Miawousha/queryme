import path from "node:path";
import fs from "node:fs";
import { loadKb } from "../lib/kb/loader";
import { assemblePublicKbText } from "../lib/kb/assembler";

/**
 * Resolve the content root. Queryme is now a content-free shell — the KB lives
 * in an external persona repo. Point this script at a local checkout via
 * PERSONA_LOCAL_OVERRIDE (e.g. `PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb`).
 */
function contentRoot(): string {
  const override = process.env.PERSONA_LOCAL_OVERRIDE;
  if (override) return override;
  throw new Error(
    "No content root. Set PERSONA_LOCAL_OVERRIDE to a local persona repo checkout, " +
      "e.g. PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb",
  );
}

async function main() {
  const root = contentRoot();
  const dir = path.resolve(root, "kb");
  if (!fs.existsSync(dir)) {
    throw new Error(`No kb/ directory at ${dir}`);
  }
  const kb = await loadKb(dir);
  const text = assemblePublicKbText(kb);
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  console.log(`  experience:      ${kb.experience.length} entries`);
  console.log(`  projects:        ${kb.projects.length} entries`);
  console.log(`  talks:           ${kb.talks.length} entries`);
  console.log(`  code:            ${kb.code.length} entries`);
  console.log(`  recommendations: ${kb.recommendations.length} entries`);
  console.log(`  skills:          ${kb.skills.skills.length} entries`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

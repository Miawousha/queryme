import path from "node:path";
import { loadKb } from "../lib/kb/loader";
import { assemblePublicKbText } from "../lib/kb/assembler";

async function main() {
  const dir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(dir);
  const text = assemblePublicKbText(kb);
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  console.log(`  experience:      ${kb.experience.length} entries`);
  console.log(`  projects:        ${kb.projects.length} entries`);
  console.log(`  talks:           ${kb.talks.length} entries`);
  console.log(`  open-source:     ${kb.openSource.length} entries`);
  console.log(`  recommendations: ${kb.recommendations.length} entries`);
  console.log(`  skills:          ${kb.skills.skills.length} entries`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

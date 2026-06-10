import path from "node:path";
import fs from "node:fs";
import { loadContent } from "../lib/kb/loader";
import { assembleContentText } from "../lib/kb/assembler";

/**
 * Resolve the content root. Queritae is now a content-free shell — the KB lives
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
  const root = path.resolve(contentRoot());
  if (!fs.existsSync(path.join(root, "kb"))) {
    throw new Error(`No kb/ directory at ${path.join(root, "kb")}`);
  }
  const content = await loadContent(root);
  const text = assembleContentText(content);
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  for (const col of content.config.collections) {
    const loaded = content.collections.get(col.name);
    if (!loaded) {
      console.log(`  ${col.name}: (absent)`);
    } else if (loaded.kind === "yaml") {
      console.log(`  ${col.name}: ok`);
    } else {
      const repoCount = loaded.entries.reduce((n, e) => {
        const repos = (e.frontmatter as { repos?: unknown[] }).repos;
        return n + (Array.isArray(repos) ? repos.length : 0);
      }, 0);
      const extra = repoCount > 0 ? ` (${repoCount} repos)` : "";
      console.log(`  ${col.name}: ${loaded.entries.length} entries${extra}`);
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

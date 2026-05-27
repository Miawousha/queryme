import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * `kb/code/index.yaml` holds the canonical tag registry plus optional bulk
 * tag assignments. Per-repo `.md` frontmatter `tags:` overrides assignments
 * here; assignments fill in tags for repos whose frontmatter omits them.
 *
 * Shape:
 *   tags:
 *     ai:        AI / ML / LLM systems
 *     nextjs:    Next.js
 *     ...
 *   assignments:
 *     queryme:   [ai, agent, mcp, nextjs]
 *     ontoloom:  [ai, agent, typescript]
 */
const CodeIndexSchema = z
  .object({
    tags: z.record(z.string().min(1), z.string()).default({}),
    assignments: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
  })
  .strict();

export type CodeIndex = z.infer<typeof CodeIndexSchema>;

/** Reads `kb/code/index.yaml`; returns an empty index if the file is absent. */
export async function loadCodeIndex(kbDir: string): Promise<CodeIndex> {
  const file = path.join(kbDir, "code", "index.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { tags: {}, assignments: {} };
  }
  const parsed = parseYaml(raw);
  return CodeIndexSchema.parse(parsed);
}

/**
 * Validates a repo's tags against the registry. Unknown tags throw — they're
 * almost always typos, and a hard error is cheaper than silent drift.
 * Returns the effective tags: per-repo wins; falls back to the index
 * assignment when the .md omits `tags`.
 */
export function resolveRepoTags(
  slug: string,
  frontmatterTags: string[] | undefined,
  index: CodeIndex,
): string[] {
  const tags = frontmatterTags ?? index.assignments[slug] ?? [];
  const allowed = new Set(Object.keys(index.tags));
  // Empty registry → treat as "anything goes" so projects can opt in
  // incrementally. As soon as you populate `tags:` in index.yaml, validation
  // turns on.
  if (allowed.size === 0) return tags;
  const unknown = tags.filter((t) => !allowed.has(t));
  if (unknown.length > 0) {
    throw new Error(
      `kb/code/${slug}: unknown tag(s) ${JSON.stringify(unknown)}; add to kb/code/index.yaml#tags or remove.`,
    );
  }
  return tags;
}

import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Kb } from "@/lib/kb/loader";

/**
 * Per-section filter. Three shapes:
 *
 *   - Missing entirely      → show everything in this section (default)
 *   - `{ all: true }`       → explicit "show everything"
 *   - `{ include: [...] }`  → whitelist; order preserved from the array
 *
 * Identifiers:
 *   - experience / projects / talks / code → file slug
 *     (`kb/experience/2025-altergo.md` → `2025-altergo`)
 *   - skills      → `skill.name` (case-insensitive exact match)
 *   - education   → `institution` (case-insensitive exact match)
 */
const SectionFilterSchema = z
  .union([z.object({ all: z.literal(true) }), z.object({ include: z.array(z.string().min(1)).min(1) })])
  .optional();

const CvConfigSchema = z
  .object({
    experience: SectionFilterSchema,
    education: SectionFilterSchema,
    skills: SectionFilterSchema,
    projects: SectionFilterSchema,
    talks: SectionFilterSchema,
    code: SectionFilterSchema,
  })
  .strict();

export type CvConfig = z.infer<typeof CvConfigSchema>;
export type SectionFilter = NonNullable<z.infer<typeof SectionFilterSchema>>;

/**
 * Reads `cv-config.yaml` at the given root if present. Absent / unreadable file
 * → `null` (the renderer treats this as "show everything"). A malformed file
 * fails loud so typos surface immediately during development.
 */
export async function loadCvConfig(rootDir: string): Promise<CvConfig | null> {
  const file = `${rootDir}/cv-config.yaml`;
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const parsed = parseYaml(raw);
  return CvConfigSchema.parse(parsed);
}

/**
 * Picks items matching `predicate` in the order they appear in `include`.
 * Unknown identifiers are dropped silently (the renderer just ends up with a
 * shorter section); we surface them as a `console.warn` so they're visible in
 * server logs during development.
 */
function whitelist<T>(
  filter: SectionFilter | undefined,
  items: T[],
  identifier: (item: T) => string,
  section: string,
): T[] {
  if (!filter || "all" in filter) return items;
  const lookup = new Map<string, T>();
  for (const item of items) lookup.set(identifier(item).toLowerCase(), item);
  const out: T[] = [];
  for (const id of filter.include) {
    const hit = lookup.get(id.toLowerCase());
    if (hit) {
      out.push(hit);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`cv-config: unknown ${section} identifier "${id}" — skipped.`);
    }
  }
  return out;
}

/**
 * Applies the CV inclusion config to a loaded KB. The shape of `Kb` is
 * preserved; only the arrays inside are trimmed/reordered.
 */
export function filterKbForCv(kb: Kb, config: CvConfig | null): Kb {
  if (!config) return kb;
  return {
    ...kb,
    experience: whitelist(config.experience, kb.experience, (e) => e.slug, "experience"),
    projects: whitelist(config.projects, kb.projects, (p) => p.slug, "projects"),
    talks: whitelist(config.talks, kb.talks, (t) => t.slug, "talks"),
    code: whitelist(config.code, kb.code, (o) => o.slug, "code").filter(
      (o) => o.frontmatter.visibility === "public" && o.frontmatter.url,
    ),
    skills: {
      skills: whitelist(config.skills, kb.skills.skills, (s) => s.name, "skills"),
    },
    education: {
      entries: whitelist(config.education, kb.education.entries, (e) => e.institution, "education"),
    },
  };
}

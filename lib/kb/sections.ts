import { slugify } from "@/lib/kb/slug";

/** A linkable section of a markdown KB document. */
export type KbSection = {
  slug: string;
  title: string;
  level: 2 | 3;
};

const HEADING_RE = /^(##|###)\s+(.+?)\s*#*\s*$/;

/**
 * Extracts h2/h3 headings from a markdown body (frontmatter already
 * stripped), skipping fenced code blocks. Duplicate slugs get -1, -2 …
 * suffixes, mirroring GitHub, so ids stay unique and deterministic.
 */
export function extractSections(body: string): KbSection[] {
  const out: KbSection[] = [];
  const used = new Map<string, number>();
  let fenceChar: string | null = null;
  for (const line of body.split("\n")) {
    const fence = line.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (fenceChar === null) fenceChar = ch;
      else if (fenceChar === ch) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    const m = line.match(HEADING_RE);
    if (!m) continue;
    const level = (m[1].length === 2 ? 2 : 3) as 2 | 3;
    const title = m[2].trim();
    let slug = slugify(title);
    if (!slug) continue;
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n}`;
    out.push({ slug, title, level });
  }
  return out;
}

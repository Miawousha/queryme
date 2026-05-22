import { parseCitations } from "@/lib/kb/citations";

/**
 * Extracts the ordered, de-duplicated KB file paths cited across a set of
 * assistant message texts. Anchors (`#section`) are ignored — surfacing is
 * per-file. Order is first-seen.
 */
export function extractCitedPaths(assistantTexts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of assistantTexts) {
    for (const citation of parseCitations(text)) {
      if (!seen.has(citation.path)) {
        seen.add(citation.path);
        out.push(citation.path);
      }
    }
  }
  return out;
}

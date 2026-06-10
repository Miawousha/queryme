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

/** One cited (path, anchor) pair, first-appearance ordered across the conversation. */
export type CitedRef = {
  path: string;
  /** Raw anchor as cited (no '#'), or null for a whole-file reference. */
  anchor: string | null;
  /** 1-based first-appearance index — the number the chat superscripts show. */
  index: number;
  /** Id of the assistant message where the pair first appeared. */
  messageId: string;
};

/** Stable dedup/lookup key for a citation pair. */
export function citedRefKey(path: string, anchor: string | null): string {
  return anchor ? `${path}#${anchor}` : path;
}

/**
 * Extracts the ordered, de-duplicated (path, anchor) citation pairs across a
 * conversation's assistant messages. Order is first-seen; a pair cited twice
 * keeps its first index (footnote semantics).
 */
export function extractCitations(messages: { id: string; text: string }[]): CitedRef[] {
  const seen = new Set<string>();
  const out: CitedRef[] = [];
  for (const m of messages) {
    for (const c of parseCitations(m.text)) {
      const key = citedRefKey(c.path, c.anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ path: c.path, anchor: c.anchor, index: out.length + 1, messageId: m.id });
    }
  }
  return out;
}

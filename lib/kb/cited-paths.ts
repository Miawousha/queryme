import { parseCitations } from "@/lib/kb/citations";

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

/**
 * Builds a key→index lookup from a CitedRef list.
 * Keys are produced by `citedRefKey`; values are 1-based first-appearance indices.
 */
export function citationIndexMap(refs: CitedRef[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of refs) {
    map[citedRefKey(r.path, r.anchor)] = r.index;
  }
  return map;
}

/**
 * Rewrites each `[^kb:<path>[#anchor]]` token in an assistant message into a
 * markdown superscript footnote link, `<sup>[\[n\]](kb://<path>[#anchor])</sup>`,
 * where `n` is the conversation-global index from `citationIndexMap`. The
 * `kb://` target is an internal sentinel the chat's `a` renderer turns into a
 * button that opens the file (and section) in the KB panel. A token whose key
 * isn't in `indices` falls back to a local 1-based counter so it still renders.
 *
 * Pure string transform — kept here alongside the rest of the citation
 * pipeline so the render stage is unit-testable without the React component.
 */
export function rewriteCitations(text: string, indices: Record<string, number>): string {
  let fallback = 0;
  let out = text;
  for (const c of parseCitations(text)) {
    fallback += 1;
    const target = citedRefKey(c.path, c.anchor);
    const n = indices[target] ?? fallback;
    out = out.replace(c.token, `<sup>[\\[${n}\\]](kb://${target})</sup>`);
  }
  return out;
}

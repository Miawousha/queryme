import { parseCitations } from "@/lib/kb/citations";
import { citedRefKey, type CitedRef } from "@/lib/kb/cited-paths";

/** The most recent assistant answer that cited ≥1 source, plus its (deduped)
 * refs carrying conversation-global indices. */
export type LatestAnswer = { messageId: string; refs: CitedRef[] };

/**
 * Walks assistant messages newest-first; the first message that carries any
 * citation wins. Its citations are de-duplicated (first order kept) and each
 * resolved to its global index via `indexMap`; cites absent from the map are
 * dropped (not browseable). Returns null when no message cites a known source.
 */
export function deriveLatestAnswer(
  assistantMessages: { id: string; text: string }[],
  indexMap: Record<string, number>,
): LatestAnswer | null {
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const m = assistantMessages[i];
    const cites = parseCitations(m.text);
    if (cites.length === 0) continue;
    const seen = new Set<string>();
    const refs: CitedRef[] = [];
    for (const c of cites) {
      const key = citedRefKey(c.path, c.anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      const index = indexMap[key];
      if (index === undefined) continue;
      refs.push({ path: c.path, anchor: c.anchor, index, messageId: m.id });
    }
    if (refs.length > 0) return { messageId: m.id, refs };
  }
  return null;
}

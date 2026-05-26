/**
 * Inline markers the agent may emit in its answer stream.
 *
 * This module is the canonical parser for the `[[forward:<question>]]` marker
 * documented in `prompts/system.md`. The renderer in
 * `components/chat-message.tsx` uses it to split assistant text into displayable
 * chunks, and `tests/prompts/system-contract.test.ts` uses it to verify the
 * prompt's documented examples actually parse.
 *
 * If you change the marker syntax here you MUST also update the description in
 * `prompts/system.md`, or the prompt-to-code contract test will fail.
 */

export type MarkerChunk =
  | { kind: "text"; value: string }
  | { kind: "forward"; question: string };

/**
 * Matches `[[forward:<question text>]]`. Non-greedy on `]` so chunks of
 * markdown like `[link](href)` inside the question would be split — but the
 * documented contract is plain text inside the marker.
 */
export const FORWARD_MARKER_RE = /\[\[(forward:[^\]]+)\]\]/g;

export function splitOnMarkers(text: string): MarkerChunk[] {
  const out: MarkerChunk[] = [];
  // Reset lastIndex implicitly by spreading via matchAll — the regex above is
  // `/g`, but `matchAll` always restarts from index 0 on the supplied string.
  let last = 0;
  for (const m of text.matchAll(FORWARD_MARKER_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
    out.push({ kind: "forward", question: m[1].slice("forward:".length).trim() });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

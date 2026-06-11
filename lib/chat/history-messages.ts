import type { ConversationTurn } from "@/lib/db/schema";
import { citedRefKey, extractCitations } from "@/lib/kb/cited-paths";

/**
 * The UI-message shape `useChat` accepts from `setMessages` — structurally a
 * subset of the AI SDK's `UIMessage` (id + role + text parts). Kept local so
 * this module stays a pure, client-importable mapping with no `ai` dependency.
 */
export type HistoryUiMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

/**
 * Maps stored transcript turns to seedable UI messages. Ids only need to be
 * distinct within the thread (extractCitations keys off them); deriving them
 * from the turn's transcript index keeps them stable across reloads. Turns
 * with no text (e.g. a tool-calls-only assistant reply persisted as "") are
 * skipped — they would render as empty bubbles.
 */
export function turnsToUiMessages(turns: ConversationTurn[]): HistoryUiMessage[] {
  return turns
    .map((turn, index) => ({
      id: `hist-${index}`,
      role: turn.role,
      parts: [{ type: "text" as const, text: turn.text }],
    }))
    .filter((message) => message.parts[0].text !== "");
}

/**
 * The citation keys (`citedRefKey` format) cited by the seeded ASSISTANT
 * messages — exactly the keys chat.tsx's `extractedRefs` memo will produce
 * for them. Pre-populating `seenAutoReveal` with these before `setMessages`
 * suppresses the tree's auto-reveal pulse for rehydrated history while
 * leaving genuinely new citations from post-reload answers free to pulse.
 */
export function historyCitationKeys(messages: HistoryUiMessage[]): string[] {
  const assistantMessages = messages
    .filter((m) => m.role === "assistant")
    .map((m) => ({ id: m.id, text: m.parts.map((p) => p.text).join("") }));
  return extractCitations(assistantMessages).map((ref) => citedRefKey(ref.path, ref.anchor));
}

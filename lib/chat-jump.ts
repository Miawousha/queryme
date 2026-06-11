/**
 * Chat-pane message anchors and the chip → chat jump.
 *
 * The KB tree pins citation chips `[n]` on cited nodes; clicking one scrolls
 * the chat to the message that cited it. The chat renderer stamps each
 * message with `chatMessageDomId(id)`; `jumpToChatMessage` resolves and
 * flashes it. Kept as a plain DOM helper (no hooks) so it is unit-testable —
 * `components/chat.tsx` can't render under jsdom (useChat/transport).
 */
import { scrollAndFlash } from "@/lib/scroll-flash";

/** DOM id for a chat message bubble — shared by the chat renderer (sets it)
 * and the KB tree chip jump (queries it). */
export function chatMessageDomId(messageId: string): string {
  return `msg-${messageId}`;
}

/**
 * Scrolls the chat pane to the cited message and flashes it. The query is
 * scoped to `root` (the chat's own scroll container) — never the document —
 * so a stray same-id element elsewhere can't be targeted. Runs synchronously
 * in the chip's click handler: the message is already committed to the DOM,
 * so no defer is needed (and requestAnimationFrame would be dead in hidden
 * tabs anyway — same reasoning as the viewer's jumpTo).
 * Returns false when the message isn't rendered inside `root`.
 */
export function jumpToChatMessage(root: HTMLElement | null, messageId: string): boolean {
  const el = root?.querySelector(`[id="${CSS.escape(chatMessageDomId(messageId))}"]`);
  if (!(el instanceof HTMLElement)) return false;
  scrollAndFlash(el);
  return true;
}

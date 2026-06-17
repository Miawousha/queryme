import type { ConversationListItem } from "@/lib/admin/data";
import { Badge } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

/**
 * Compact list-cell for a conversation. When the agent has identified the
 * visitor (`interviewer != null`) the row leads with the interviewer's name and
 * role/company; otherwise it shows channel + turn count. One component serves
 * both the "All" and "Interviewers" segments of the Conversations list.
 */
export function ConversationRow({ conversation }: { conversation: ConversationListItem }) {
  const turns = conversation.turnCount;
  const identity = conversation.interviewer;

  if (identity) {
    const subtitle = [identity.role, identity.company].filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm text-[var(--color-text-primary)]">
            {identity.name ?? "Unknown name"}
          </span>
          <Badge>{identity.basis}</Badge>
          <Badge>{conversation.channel}</Badge>
          <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {fmt(conversation.lastMessageAt)}
          </span>
        </div>
        {subtitle && (
          <span className="text-[12px] text-[var(--color-text-tertiary)]">{subtitle}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
      <Badge>{conversation.channel}</Badge>
      {conversation.language && <Badge>{conversation.language}</Badge>}
      <span className="ml-auto flex items-center gap-3 text-[var(--color-text-tertiary)]">
        <span>{turns} turns</span>
        <span>{fmt(conversation.lastMessageAt)}</span>
      </span>
    </div>
  );
}

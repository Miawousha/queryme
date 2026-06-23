import type { ConversationListItem } from "@/lib/admin/data";
import { Avatar, Badge } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

/**
 * List-cell for a conversation. Leads with an identity chip, then the
 * interviewer's name + role/company when the agent has identified the visitor
 * (`interviewer != null`), otherwise an "Anonymous" row with channel + turns.
 * A trailing badge (identity basis / channel) and timestamp sit on the right.
 * One component serves both the "All" and "Interviewers" segments.
 */
export function ConversationRow({ conversation }: { conversation: ConversationListItem }) {
  const turns = conversation.turnCount;
  const identity = conversation.interviewer;
  const name = identity ? identity.name ?? "Unknown name" : "Anonymous";
  const meta = identity
    ? [identity.role, identity.company].filter(Boolean).join(" · ")
    : [`${turns} turns`, conversation.language].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3">
      <Avatar name={identity?.name ?? null} tone={identity ? "accent" : "muted"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-sm text-[var(--color-text-primary)]">
          {name}
        </span>
        {meta && <span className="truncate text-xs text-[var(--color-text-tertiary)]">{meta}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge>{identity ? identity.basis : conversation.channel}</Badge>
        <span className="font-mono text-2xs text-[var(--color-text-tertiary)]">
          {fmt(conversation.lastMessageAt)}
        </span>
      </div>
    </div>
  );
}

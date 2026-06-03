import type { Conversation } from "@/lib/db/schema";
import { Badge, Field, LABEL } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

/**
 * Unified detail body for a conversation. If the agent identified the visitor,
 * an interviewer-identity block is shown above the transcript — the same record
 * serves both the "Conversations" and "Interviewers" views, so there is no
 * cross-link to a separate conversation panel.
 */
export function ConversationDetail({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  const identity = conversation.interviewer;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{conversation.channel}</Badge>
        {conversation.language && <Badge>{conversation.language}</Badge>}
        {identity && <Badge>{identity.basis}</Badge>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {turns.length} turns
        </span>
      </div>

      {identity && (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-3">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Interviewer</span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">updated {fmt(identity.updatedAt)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {identity.company && <Field label="Company" value={identity.company} />}
            {identity.role && <Field label="Role" value={identity.role} />}
            {identity.hiringFor && <Field label="Hiring for" value={identity.hiringFor} />}
            {identity.contact && <Field label="Contact" value={identity.contact} />}
          </div>
          {identity.notes && (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Notes</span>
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {identity.notes}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
        id {conversation.id} · started {fmt(conversation.startedAt)} · last{" "}
        {fmt(conversation.lastMessageAt)}
      </p>

      {turns.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">Empty transcript.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className={LABEL}>
                {t.role} · {fmt(t.at)}
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-primary)]">
                {t.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

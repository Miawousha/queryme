import type { ForwardedQuestion } from "@/lib/db/schema";
import { fmt } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

/**
 * List-cell for a forwarded question. A leading status chip (accent dot when
 * unanswered, emerald check when answered) makes the queue scannable; the
 * question text leads, with timestamps and the answered/unanswered label below.
 */
export function QuestionRow({ question }: { question: ForwardedQuestion }) {
  const answered = question.answeredAt != null;
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
          answered
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            : "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.08)] text-[var(--color-accent)]",
        )}
      >
        {answered ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-control text-[var(--color-text-primary)]">{question.question}</p>
        <div className="flex flex-wrap items-center gap-2 text-2xs text-[var(--color-text-tertiary)]">
          <span>{fmt(question.createdAt)}</span>
          {answered ? (
            <span className="font-mono text-3xs uppercase text-[var(--color-text-secondary)]">
              answered {fmt(question.answeredAt)}
            </span>
          ) : (
            <span className="font-mono text-3xs uppercase text-[var(--color-accent)]">unanswered</span>
          )}
        </div>
      </div>
    </div>
  );
}

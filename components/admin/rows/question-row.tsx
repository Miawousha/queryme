import type { ForwardedQuestion } from "@/lib/db/schema";
import { fmt } from "@/lib/admin/format";

export function QuestionRow({ question }: { question: ForwardedQuestion }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-[var(--color-text-primary)]">{question.question}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span>{fmt(question.createdAt)}</span>
        {question.answeredAt ? (
          <span className="font-mono text-[9px] uppercase text-[var(--color-text-secondary)]">
            answered {fmt(question.answeredAt)}
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase text-[var(--color-accent)]">
            unanswered
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

export type ThinkingIndicatorProps = {
  agentLabel: string;
  label: string;
};

export function ThinkingIndicator({ agentLabel, label }: ThinkingIndicatorProps) {
  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div
        className="relative max-w-[85%] border border-[var(--color-border)] bg-[var(--color-void)] px-4 py-3"
      >
        <span className="mb-2 flex items-center gap-1.5 font-heading text-2xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
          <span aria-hidden className="text-[var(--color-brand)]">
            ✦
          </span>
          {agentLabel}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="thinking-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="text-shimmer text-control">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

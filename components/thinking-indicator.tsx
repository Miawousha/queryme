"use client";

export type ThinkingIndicatorProps = {
  agentLabel: string;
  label: string;
};

export function ThinkingIndicator({ agentLabel, label }: ThinkingIndicatorProps) {
  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div
        className="relative max-w-[85%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
        style={{
          backgroundImage:
            "linear-gradient(rgba(var(--color-primary-rgb),0.06), rgba(var(--color-primary-rgb),0.06))",
        }}
      >
        <span
          className="mb-1 block font-mono text-3xs uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          {agentLabel}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="thinking-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="text-control italic text-[var(--color-text-secondary)]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

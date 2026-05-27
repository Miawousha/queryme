"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
    >
      {label}
    </button>
  );
}

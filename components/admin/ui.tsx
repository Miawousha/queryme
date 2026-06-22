import type { ReactNode } from "react";

/** Small uppercase mono caption used across the admin UI. */
export const LABEL = "font-mono text-2xs uppercase text-[var(--color-text-tertiary)]";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-3xs uppercase text-[var(--color-text-secondary)]"
      style={{ letterSpacing: "0.16em" }}
    >
      {children}
    </span>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-control text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small uppercase mono caption used across the admin UI. */
export const LABEL = "font-mono text-2xs uppercase text-[var(--color-text-tertiary)]";

/** First letters of the first two words of a name, uppercased. "" when blank. */
export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Round initials/identity chip for list rows. Named people get accent-tinted
 * initials; anonymous rows fall back to a muted user glyph. Decorative — the
 * name is always rendered alongside, so the chip is aria-hidden.
 */
export function Avatar({ name, tone = "muted" }: { name?: string | null; tone?: "accent" | "muted" }) {
  const initials = initialsFrom(name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-medium",
        tone === "accent"
          ? "bg-[rgba(var(--color-accent-rgb),0.12)] text-[var(--color-accent)]"
          : "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-tertiary)]",
      )}
    >
      {initials || (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  );
}

/**
 * Compact metric tile: a mono label over a large display-font number. Used in
 * strips of 3–4 to give a list page at-a-glance signal and visual rhythm.
 */
export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--color-card)]/40 px-4 py-3",
        tone === "warn" ? "border-[rgba(239,159,39,0.4)]" : "border-[var(--color-border)]",
      )}
    >
      <div className={LABEL}>{label}</div>
      <div
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold tracking-tight",
          tone === "accent"
            ? "text-[var(--color-accent)]"
            : tone === "warn"
              ? "text-[#ef9f27]"
              : "text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

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

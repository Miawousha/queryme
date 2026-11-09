import { cn } from "@/lib/utils";

/*
 * The pieces of Matrice's design language (matrice-website-v2:
 * components/site/section.tsx and components/shell/page-header.tsx), so a
 * queritae page reads as a Matrice page: the blue eyebrow badge over a title,
 * the mono label strip with its ✦ mark and a "// note", and the small mono
 * status tag.
 */

/** The mono uppercase label the strips, field labels and small headers use. */
export const LABEL = "font-heading text-label uppercase tracking-[0.14em]";

/** A page or section title: the heading face, uppercase, set tight. */
export const TITLE = "font-heading font-medium uppercase tracking-[-0.02em] text-balance";

/** The small blue badge that names a section. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[6px] bg-[rgba(var(--color-brand-rgb),0.12)] px-2 py-0.5 text-sm font-medium text-[var(--color-brand)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** The ✦ mark that heads every label strip, in the brand. */
export function Spark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[var(--color-brand)]", className)} aria-hidden="true">
      ✦
    </span>
  );
}

/**
 * The strip across the top of a framed block: "✦ LABEL" on the left, a muted
 * "// note" on the right, over a dashed rule.
 */
export function LabelStrip({
  label,
  note,
  className,
  as: Tag = "div",
}: {
  label: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  as?: "div" | "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "flex items-center justify-between gap-4 border-b border-dashed border-[var(--color-border)] px-5 py-3.5 text-[var(--color-text-primary)]",
        LABEL,
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Spark />
        <span className="truncate">{label}</span>
      </span>
      {note != null ? (
        <span className="shrink-0 text-[var(--color-text-secondary)]">
          {"// "}
          {note}
        </span>
      ) : null}
    </Tag>
  );
}

/** A framed block headed by a label strip — v2's workspace Panel. */
export function Panel({
  label,
  note,
  children,
  className,
  bodyClassName,
}: {
  label: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-[var(--color-border)] bg-[var(--color-void)]", className)}>
      <LabelStrip label={label} note={note} />
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export type StatusTone = "brand" | "muted" | "danger" | "warn" | "ok";

/** A small mono status tag: live, failed, active, expired… */
export function StatusTag({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(statusTagClass(tone), className)}>{children}</span>
  );
}

export function statusTagClass(tone: StatusTone) {
  return cn(
    "inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-heading text-2xs uppercase tracking-[0.12em] whitespace-nowrap",
    tone === "brand" &&
      "border-[rgba(var(--color-brand-rgb),0.4)] bg-[rgba(var(--color-brand-rgb),0.1)] text-[var(--color-brand)]",
    tone === "muted" && "border-[var(--color-border)] text-[var(--color-text-secondary)]",
    tone === "danger" &&
      "border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]",
    tone === "warn" &&
      "border-[var(--color-stale)]/40 bg-[var(--color-stale)]/10 text-[var(--color-stale)]",
    tone === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  );
}

/**
 * A column framed by hatched gutters, as v2 frames its pages: the content in
 * the middle, a 5rem band of diagonal hatching either side from lg up.
 */
export function HatchedFrame({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-[1400px] lg:grid-cols-[5rem_minmax(0,1fr)_5rem]",
        className,
      )}
    >
      <div className="hidden border-r border-[var(--color-border)] bg-hatch lg:block" aria-hidden="true" />
      <div className={cn("min-w-0", innerClassName)}>{children}</div>
      <div className="hidden border-l border-[var(--color-border)] bg-hatch lg:block" aria-hidden="true" />
    </div>
  );
}

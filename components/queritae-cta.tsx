"use client";

import { useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils";

export type QueritaeCtaStrings = {
  /** Lowercase wordmark shown in the pill. */
  pill: string;
  /** Modal heading + pill accessible name. */
  title: string;
  /** Fully-resolved, personalized pitch sentence (host substitutes the name). */
  pitch: string;
  /** Short value props. */
  bullets: readonly string[];
  /** Primary CTA label (→ landing). */
  exploreCta: string;
  /** Secondary CTA label (→ GitHub signup). */
  signupCta: string;
  /** Close-button accessible name. */
  close: string;
};

export type QueritaeCtaProps = {
  strings: QueritaeCtaStrings;
  /** Primary CTA target — the landing page, carrying the attribution param. */
  landingHref: string;
  /** Secondary CTA target — the GitHub OAuth entry point. */
  signupHref: string;
  /** Extra classes to tune the pill to its host bar. */
  className?: string;
};

/**
 * Neutral "queritae" wordmark pill that doubles as ambient platform attribution
 * and the trigger for a short platform-explainer modal. Self-contained: owns its
 * own open state and a11y wiring. Purely presentational — the host passes an
 * already-personalized `pitch`. Modal markup mirrors `AboutPopover`.
 */
export function QueritaeCta({ strings, landingHref, signupHref, className }: QueritaeCtaProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const dialogRef = useDialog<HTMLDivElement>(open, close);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={strings.title}
        title={strings.title}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-2.5 py-1 font-mono text-2xs lowercase tracking-[0.14em] text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
          className,
        )}
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        {strings.pill}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="queritae-cta-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="queritae-cta-title"
                className="font-display text-base font-semibold text-[var(--color-text-primary)]"
              >
                {strings.title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={strings.close}
                className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="text-control leading-relaxed text-[var(--color-text-secondary)]">
              {strings.pitch}
            </p>

            <ul className="flex flex-col gap-2 text-control">
              {strings.bullets.map((b) => (
                <li key={b} className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--color-accent)]" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <a
                href={landingHref}
                className="inline-flex items-center rounded-full bg-[var(--color-primary)] px-4 py-1.5 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90"
              >
                {strings.exploreCta}
              </a>
              <a
                href={signupHref}
                className="inline-flex items-center font-mono text-2xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
              >
                {strings.signupCta}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

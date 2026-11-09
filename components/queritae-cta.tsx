"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
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
          "inline-flex h-8 items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-void)] px-2.5 font-heading text-2xs lowercase tracking-[0.14em] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]",
          className,
        )}
      >
        <span aria-hidden className="text-[var(--color-brand)]">✦</span>
        {strings.pill}
      </button>

      {open && createPortal(
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
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="-mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-dashed border-[var(--color-border)] px-6 py-3.5">
              <h2
                id="queritae-cta-title"
                className="flex items-center gap-2 font-heading text-label uppercase tracking-[0.14em] text-[var(--color-text-primary)]"
              >
                <span aria-hidden className="text-[var(--color-brand)]">✦</span>
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
                className="inline-flex items-center bg-[var(--color-text-primary)] px-4 py-1.5 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-[var(--color-void)] transition-opacity hover:opacity-90"
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
        </div>,
        document.body,
      )}
    </>
  );
}

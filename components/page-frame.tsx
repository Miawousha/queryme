import Link from "next/link";
import { MatriceLogo } from "@/components/matrice-logo";
import { Eyebrow, HatchedFrame, LabelStrip, TITLE } from "@/components/ui/matrice";
import { cn } from "@/lib/utils";

/*
 * The frame of queritae's standalone screens, ported from matrice-website-v2
 * (components/shell/auth-frame.tsx): the site's header, a label strip, and
 * the copy (with an optional panel beside it on the dot grid), between
 * hatched gutters — so a sign-in error or a legal page reads as the site.
 */

/** The header every standalone screen shares: the mark and the wordmark, home. */
export function FrameHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="queritae, home">
          <MatriceLogo size={21} />
          <span className="font-heading text-[15px] font-bold uppercase leading-none tracking-[0.14em] text-[var(--color-text-primary)]">
            queritae
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}

/** A screen with a message and its next step: sign-in failed, waitlist, ToS. */
export function AuthFrame({
  label,
  note,
  eyebrow,
  title,
  lead,
  actions,
  children,
}: {
  label: string;
  note?: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  /** A form or panel shown beside the copy, on the dot grid. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-void)] text-[var(--color-text-primary)]">
      <FrameHeader />
      <HatchedFrame className="flex-1" innerClassName="flex flex-col">
        <main className="flex flex-1 flex-col">
          <LabelStrip label={label} note={note} className="px-4 py-5 sm:px-6 lg:px-10" />
          <div className={cn("grid flex-1", children && "lg:grid-cols-2")}>
            <div className="px-4 py-14 sm:px-6 sm:py-20 lg:px-10">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h1
                className={cn(
                  TITLE,
                  "mt-4 max-w-xl text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.1] text-[var(--color-text-primary)]",
                )}
              >
                {title}
              </h1>
              {lead ? (
                <div className="mt-5 flex max-w-md flex-col gap-4 text-[17px] leading-relaxed text-[var(--color-text-secondary)]">
                  {lead}
                </div>
              ) : null}
              {actions ? <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div> : null}
            </div>
            {children ? (
              <div className="flex items-center border-t border-[var(--color-border)] bg-dots px-4 py-14 sm:px-6 lg:border-l lg:border-t-0 lg:px-10">
                <div className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-void)] p-6 sm:p-8">
                  {children}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </HatchedFrame>
    </div>
  );
}

/** A long read (terms, privacy): the frame, a title, then the text column. */
export function DocumentFrame({
  label,
  note,
  eyebrow,
  title,
  children,
}: {
  label: string;
  note?: string;
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-void)] text-[var(--color-text-primary)]">
      <FrameHeader />
      <HatchedFrame className="flex-1">
        <main>
          <LabelStrip label={label} note={note} className="px-4 py-5 sm:px-6 lg:px-10" />
          <div className="border-b border-[var(--color-border)] px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1
              className={cn(
                TITLE,
                "mt-4 text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.1] text-[var(--color-text-primary)]",
              )}
            >
              {title}
            </h1>
          </div>
          <article className="max-w-2xl px-4 py-12 text-[var(--color-text-secondary)] sm:px-6 lg:px-10">
            {children}
          </article>
        </main>
      </HatchedFrame>
    </div>
  );
}

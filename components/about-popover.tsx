"use client";

import { useDialog } from "@/lib/use-dialog";
import { normalizeRepoUrl } from "@/lib/repo";

export type AboutPopoverStrings = {
  title: string;
  close: string;
  transparency: string;
  systemPrompt: string;
  kb: string;
  repo: string;
  mcpDocs: string;
  printableCv: string;
  report: string;
};

export type AboutPopoverProps = {
  open: boolean;
  onClose: () => void;
  strings: AboutPopoverStrings;
  /** The app's own repo. Hosts the MCP docs (`docs/MCP.md`). */
  repoUrl: string;
  branch: string;
  /**
   * The active persona's content repo — hosts the system prompt, the KB, and
   * everything the agent knows. `null` when no content repo is configured, in
   * which case the content-repo links are dropped rather than pointing nowhere.
   */
  contentRepoUrl: string | null;
  contentRepoBranch: string | null;
  cvHref: string;
  reportHref: string | null;
};

/**
 * "About this project" modal. Holds the transparency note and the repo links
 * that used to live in the page footer, which the full-bleed app shell drops.
 * Open/close contract and overlay markup mirror `McpModal`.
 */
export function AboutPopover({
  open,
  onClose,
  strings,
  repoUrl,
  branch,
  contentRepoUrl,
  contentRepoBranch,
  cvHref,
  reportHref,
}: AboutPopoverProps) {
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);

  if (!open) return null;

  // The MCP docs live in the app repo; the system prompt, KB, and the agent's
  // knowledge live in the per-account content repo.
  const links: { href: string; label: string; external?: boolean }[] = [
    { href: cvHref, label: strings.printableCv },
    { href: `${repoUrl}/blob/${branch}/docs/MCP.md`, label: strings.mcpDocs, external: true },
  ];

  if (contentRepoUrl) {
    const base = normalizeRepoUrl(contentRepoUrl);
    const ref = contentRepoBranch ?? "HEAD";
    links.push(
      { href: `${base}/blob/${ref}/prompts/system.md`, label: strings.systemPrompt, external: true },
      { href: `${base}/tree/${ref}/kb`, label: strings.kb, external: true },
      { href: base, label: strings.repo, external: true },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-popover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="about-popover-title"
            className="font-display text-base font-semibold text-[var(--color-text-primary)]"
          >
            {strings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.close}
            className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p
          className="font-mono text-2xs uppercase leading-relaxed text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.24em" }}
        >
          {strings.transparency}
        </p>

        <div className="flex flex-col gap-2 text-control">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="group inline-flex items-center gap-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
            >
              <span
                aria-hidden
                className="inline-block h-1 w-1 rounded-full bg-[var(--color-text-tertiary)] transition-colors group-hover:bg-[var(--color-accent)]"
              />
              {link.label}
            </a>
          ))}
        </div>

        {reportHref && (
          <div className="mt-1 border-t border-[var(--color-border)] pt-3">
            <a
              href={reportHref}
              className="inline-flex items-center gap-2 text-2xs uppercase tracking-wide text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            >
              {strings.report}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

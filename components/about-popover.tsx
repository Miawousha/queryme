"use client";

import { useEffect } from "react";

export type AboutPopoverStrings = {
  title: string;
  close: string;
  transparency: string;
  systemPrompt: string;
  kb: string;
  repo: string;
};

export type AboutPopoverProps = {
  open: boolean;
  onClose: () => void;
  strings: AboutPopoverStrings;
  repoUrl: string;
  branch: string;
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
}: AboutPopoverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const links: { href: string; label: string }[] = [
    { href: `${repoUrl}/blob/${branch}/prompts/system.md`, label: strings.systemPrompt },
    { href: `${repoUrl}/tree/${branch}/kb`, label: strings.kb },
    { href: repoUrl, label: strings.repo },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={strings.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
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
          className="font-mono text-[10px] uppercase leading-relaxed text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.24em" }}
        >
          {strings.transparency}
        </p>

        <div className="flex flex-col gap-2 text-[13px]">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
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
      </div>
    </div>
  );
}

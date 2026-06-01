"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";

export type AppTopBarProps = {
  lang: UiLang;
  onLangChange: (next: UiLang) => void;
  themeToggleLabel: string;
  mcpButtonLabel?: string;
  onOpenMcp?: () => void;
  aboutButtonLabel: string;
  onOpenAbout: () => void;
  /** Active persona content repo to link to (icon button), or null to hide it. */
  sourceRepo?: { url: string; label: string } | null;
  cvButtonLabel?: string;
  onOpenCv?: () => void;
  kbCollapsed: boolean;
  onToggleKb: () => void;
  kbShowLabel: string;
  kbHideLabel: string;
};

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:text-[var(--color-accent)]";

/**
 * Slim full-width app chrome. Sits above the two-pane body in the app shell.
 * Owns no state — the parent passes language, modal openers, and the KB
 * collapsed state + toggle.
 */
export function AppTopBar({
  lang,
  onLangChange,
  themeToggleLabel,
  mcpButtonLabel,
  onOpenMcp,
  aboutButtonLabel,
  onOpenAbout,
  sourceRepo,
  cvButtonLabel,
  onOpenCv,
  kbCollapsed,
  onToggleKb,
  kbShowLabel,
  kbHideLabel,
}: AppTopBarProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
      <h1 className="sr-only">Alexandre Collet — Queryable CV</h1>
      <div className="flex shrink-0 items-center gap-3">
        <MatriceLogo size={28} animated />
        {/* Name hidden on mobile — the controls cluster needs the full row width. */}
        <div className="hidden flex-col leading-tight sm:flex">
          <span
            className="whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            Alexandre Collet
          </span>
          <span
            className="whitespace-nowrap font-display text-[14px] font-medium text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            Queryable CV
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle label={themeToggleLabel} />
        {onOpenMcp && (
          <button
            type="button"
            onClick={onOpenMcp}
            aria-label={mcpButtonLabel}
            title={mcpButtonLabel}
            aria-haspopup="dialog"
            className={ICON_BTN}
          >
            <McpIcon />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenAbout}
          aria-label={aboutButtonLabel}
          title={aboutButtonLabel}
          aria-haspopup="dialog"
          className={ICON_BTN}
        >
          <InfoIcon />
        </button>
        {sourceRepo && (
          <a
            href={sourceRepo.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={sourceRepo.label}
            title={sourceRepo.label}
            className={ICON_BTN}
          >
            <GitHubIcon />
          </a>
        )}
        {onOpenCv && (
          <button
            type="button"
            onClick={onOpenCv}
            aria-label={cvButtonLabel}
            title={cvButtonLabel}
            className={ICON_BTN}
          >
            <CvIcon />
          </button>
        )}
        <LanguageToggle value={lang} onChange={onLangChange} />
        <button
          type="button"
          onClick={onToggleKb}
          aria-label={kbCollapsed ? kbShowLabel : kbHideLabel}
          title={kbCollapsed ? kbShowLabel : kbHideLabel}
          aria-pressed={!kbCollapsed}
          className={cn(
            ICON_BTN,
            "hidden sm:inline-flex",
            !kbCollapsed && "text-[var(--color-accent)]",
          )}
        >
          <PanelIcon />
        </button>
      </div>
    </header>
  );
}

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Plug — "connect via MCP". */
function McpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" />
    </svg>
  );
}

/** Info circle — "about this project". */
function InfoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

/** GitHub mark — links to the persona content repository. */
function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

/** Document icon — opens the printable CV in the side panel. */
function CvIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
    </svg>
  );
}

/** Panel with a right pane — toggles the KB side panel. */
function PanelIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  );
}

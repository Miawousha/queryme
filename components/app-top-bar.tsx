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
  mcpButtonLabel: string;
  onOpenMcp: () => void;
  aboutButtonLabel: string;
  onOpenAbout: () => void;
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
  kbCollapsed,
  onToggleKb,
  kbShowLabel,
  kbHideLabel,
}: AppTopBarProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
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

/** Panel with a right pane — toggles the KB side panel. */
function PanelIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  );
}

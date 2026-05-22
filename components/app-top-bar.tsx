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

const PILL_CLASS =
  "inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:text-[var(--color-accent)]";

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
          aria-haspopup="dialog"
          className={PILL_CLASS}
          style={{ letterSpacing: "0.3em" }}
        >
          MCP
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          aria-label={aboutButtonLabel}
          aria-haspopup="dialog"
          className={PILL_CLASS}
          style={{ letterSpacing: "0.3em" }}
        >
          About
        </button>
        <LanguageToggle value={lang} onChange={onLangChange} />
        <button
          type="button"
          onClick={onToggleKb}
          aria-label={kbCollapsed ? kbShowLabel : kbHideLabel}
          aria-pressed={!kbCollapsed}
          className={cn(PILL_CLASS, "hidden sm:inline-flex")}
          style={{ letterSpacing: "0.3em" }}
        >
          KB
        </button>
      </div>
    </header>
  );
}

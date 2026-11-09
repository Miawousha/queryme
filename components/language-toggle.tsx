"use client";

import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";

export type LanguageToggleProps = {
  value: UiLang;
  onChange: (next: UiLang) => void;
};

export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  return (
    <div
      className="inline-flex h-8 overflow-hidden border border-[var(--color-border)] bg-[var(--color-void)]"
    >
      {(["en", "fr"] as const).map((lang) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(lang)}
            className={cn(
              "px-2.5 font-heading text-2xs uppercase tracking-[0.14em] transition-colors duration-150",
              active
                ? "bg-[var(--color-text-primary)] text-[var(--color-void)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-card)] hover:text-[var(--color-text-primary)]",
            )}
            aria-pressed={active}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}

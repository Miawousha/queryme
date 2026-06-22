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
      className="inline-flex overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 p-0.5 backdrop-blur"
    >
      {(["en", "fr"] as const).map((lang) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(lang)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-2xs uppercase transition-all duration-200",
              active
                ? "bg-[rgba(var(--color-accent-rgb),0.18)] text-[var(--color-accent)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]",
            )}
            style={{ letterSpacing: "0.3em" }}
            aria-pressed={active}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";

export type LanguageToggleProps = {
  value: UiLang;
  onChange: (next: UiLang) => void;
};

export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[var(--color-border)] text-xs">
      {(["en", "fr"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={cn(
            "px-3 py-1 uppercase tracking-wide",
            value === lang
              ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}

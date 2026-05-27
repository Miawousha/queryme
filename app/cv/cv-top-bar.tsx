"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import type { UiLang } from "@/lib/language";

export function CvTopBar({ lang, printLabel, backLabel }: { lang: UiLang; printLabel: string; backLabel: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-trigger the print dialog when the page is opened with `?print=1`.
  // The KB panel's "Print" action launches `/cv?lang=X&print=1` in a new tab
  // so the standalone CV's print stylesheet (A4) governs the output.
  useEffect(() => {
    if (searchParams.get("print") === "1") {
      const id = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(id);
    }
  }, [searchParams]);

  return (
    <div className="no-print mb-8 flex items-center justify-between gap-3">
      <Link
        href="/"
        className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        ← {backLabel}
      </Link>
      <div className="flex items-center gap-2">
        <LanguageToggle
          value={lang}
          onChange={(next) => {
            router.push(`/cv?lang=${next}`);
          }}
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full border border-[var(--color-border)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {printLabel}
        </button>
      </div>
    </div>
  );
}

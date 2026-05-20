"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { GridBackground } from "@/components/grid-background";
import { LanguageToggle } from "@/components/language-toggle";
import { MatriceLogo } from "@/components/matrice-logo";
import { UI_STRINGS, type UiLang } from "@/lib/language";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const t = UI_STRINGS[lang];

  return (
    <>
      <GridBackground />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20">
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <MatriceLogo size={32} animated />
            <div className="flex flex-col leading-tight">
              <span
                className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
                style={{ letterSpacing: "0.32em" }}
              >
                Alexandre Collet
              </span>
              <span
                className="font-display text-[15px] font-medium text-[var(--color-text-primary)]"
                style={{ letterSpacing: "-0.01em" }}
              >
                Queryable CV
              </span>
            </div>
          </div>
          <LanguageToggle value={lang} onChange={setLang} />
        </header>

        <section className="fade-up flex flex-col gap-5" style={{ animationDelay: "0.1s" }}>
          <span
            className="font-mono text-[11px] uppercase text-[var(--color-accent)]"
            style={{ letterSpacing: "0.4em" }}
          >
            {lang === "en" ? "Ask · Learn · Connect" : "Demander · Découvrir · Contacter"}
          </span>
          <h1
            className="font-display text-[clamp(34px,5vw,52px)] font-light text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            {lang === "en" ? (
              <>
                A CV that{" "}
                <span className="font-serif italic text-[var(--color-accent)]">answers back.</span>
              </>
            ) : (
              <>
                Un CV qui{" "}
                <span className="font-serif italic text-[var(--color-accent)]">vous répond.</span>
              </>
            )}
          </h1>
          <p
            className="max-w-xl text-[15px] leading-relaxed text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.005em" }}
          >
            {t.intro}
          </p>
        </section>

        <Chat
          repoUrl={REPO_URL}
          branch={BRANCH}
          intro={t.intro}
          placeholder={t.placeholder}
          sendLabel={t.send}
          startersTitle={t.startersTitle}
          starters={[...t.starters]}
        />

        <footer
          className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-6"
          style={{ transition: "border-color 0.4s" }}
        >
          <p
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
            style={{ letterSpacing: "0.28em" }}
          >
            {t.footer.transparency}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--color-text-secondary)]">
            <FooterLink href={`${REPO_URL}/blob/${BRANCH}/prompts/system.md`}>
              {t.footer.systemPrompt}
            </FooterLink>
            <FooterLink href={`${REPO_URL}/tree/${BRANCH}/kb`}>{t.footer.kb}</FooterLink>
            <FooterLink href={REPO_URL}>{t.footer.repo}</FooterLink>
          </div>
        </footer>
      </main>
    </>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
    >
      <span
        aria-hidden
        className="inline-block h-1 w-1 rounded-full bg-[var(--color-text-tertiary)] transition-colors group-hover:bg-[var(--color-accent)]"
      />
      {children}
    </a>
  );
}

"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { GridBackground } from "@/components/grid-background";
import { LanguageToggle } from "@/components/language-toggle";
import { MatriceLogo } from "@/components/matrice-logo";
import { McpModal } from "@/components/mcp-modal";
import { UI_STRINGS, type UiLang } from "@/lib/language";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const t = UI_STRINGS[lang];

  return (
    <>
      <GridBackground />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMcpOpen(true)}
              aria-label={t.mcp.buttonLabel}
              aria-haspopup="dialog"
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:text-[var(--color-accent)]"
              style={{ letterSpacing: "0.3em" }}
            >
              MCP
            </button>
            <LanguageToggle value={lang} onChange={setLang} />
          </div>
        </header>

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

      <McpModal open={mcpOpen} onClose={() => setMcpOpen(false)} strings={t.mcp} />
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

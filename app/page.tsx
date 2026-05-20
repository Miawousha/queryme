"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { LanguageToggle } from "@/components/language-toggle";
import { UI_STRINGS, type UiLang } from "@/lib/language";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const t = UI_STRINGS[lang];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.headline}</h1>
        <LanguageToggle value={lang} onChange={setLang} />
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

      <footer className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
        <p>{t.footer.transparency}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={`${REPO_URL}/blob/${BRANCH}/prompts/system.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t.footer.systemPrompt}
          </a>
          <a
            href={`${REPO_URL}/tree/${BRANCH}/kb`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t.footer.kb}
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
            {t.footer.repo}
          </a>
        </div>
      </footer>
    </main>
  );
}

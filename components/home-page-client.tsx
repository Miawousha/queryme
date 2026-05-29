"use client";

import { useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { HomeShell } from "@/components/home-shell";
import { KbProvider } from "@/components/kb/kb-context";
import type { AllLocaleStrings, UiLang, UiStrings } from "@/lib/language";

type Props = {
  /** Pre-built strings for both locales, computed server-side from persona. */
  strings: AllLocaleStrings;
};

export function HomePageClient({ strings }: Props) {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);
  const t = strings[lang] as UiStrings;

  return (
    <KbProvider lang={lang} kbStrings={t.kb}>
      <GridBackground />
      <HomeShell
        t={t}
        lang={lang}
        onLangChange={setLang}
        mcpOpen={mcpOpen}
        onMcpOpenChange={setMcpOpen}
        aboutOpen={aboutOpen}
        onAboutOpenChange={setAboutOpen}
        kbCollapsed={kbCollapsed}
        onKbCollapsedChange={setKbCollapsed}
      />
    </KbProvider>
  );
}

"use client";

import { useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { HomeShell } from "@/components/home-shell";
import { KbProvider } from "@/components/kb/kb-context";
import type { UiLang } from "@/lib/language";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);

  return (
    <KbProvider lang={lang}>
      <GridBackground />
      <HomeShell
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

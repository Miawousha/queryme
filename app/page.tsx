"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/app-top-bar";
import { AboutPopover } from "@/components/about-popover";
import { Chat } from "@/components/chat";
import { GridBackground } from "@/components/grid-background";
import { KbProvider } from "@/components/kb/kb-context";
import { KbPanel } from "@/components/kb/kb-panel";
import { KbLayout } from "@/components/kb/kb-layout";
import { McpModal } from "@/components/mcp-modal";
import { UI_STRINGS, type UiLang } from "@/lib/language";
import { REPO_URL, REPO_BRANCH } from "@/lib/repo";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);
  const t = UI_STRINGS[lang];

  return (
    <KbProvider lang={lang}>
      <GridBackground />

      <div className="relative z-10 flex h-dvh flex-col">
        <AppTopBar
          lang={lang}
          onLangChange={setLang}
          themeToggleLabel={t.themeToggle}
          mcpButtonLabel={t.mcp.buttonLabel}
          onOpenMcp={() => setMcpOpen(true)}
          aboutButtonLabel={t.about.buttonLabel}
          onOpenAbout={() => setAboutOpen(true)}
          kbCollapsed={kbCollapsed}
          onToggleKb={() => setKbCollapsed((c) => !c)}
          kbShowLabel={t.kbPanel.show}
          kbHideLabel={t.kbPanel.hide}
        />

        <KbLayout
          collapsed={kbCollapsed}
          onCollapsedChange={setKbCollapsed}
          chat={<Chat t={t} />}
          panel={<KbPanel />}
        />
      </div>

      <McpModal open={mcpOpen} onClose={() => setMcpOpen(false)} strings={t.mcp} />
      <AboutPopover
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        strings={{
          title: t.about.title,
          close: t.about.close,
          transparency: t.footer.transparency,
          systemPrompt: t.footer.systemPrompt,
          kb: t.footer.kb,
          repo: t.footer.repo,
        }}
        repoUrl={REPO_URL}
        branch={REPO_BRANCH}
      />
    </KbProvider>
  );
}

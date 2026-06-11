"use client";

import { AppTopBar } from "@/components/app-top-bar";
import { AboutPopover } from "@/components/about-popover";
import { Chat } from "@/components/chat";
import { CV_VIRTUAL_PATH, useKb } from "@/components/kb/kb-context";
import { KbPanel } from "@/components/kb/kb-panel";
import { KbLayout } from "@/components/kb/kb-layout";
import { McpModal } from "@/components/mcp-modal";
import type { UiLang, UiStrings } from "@/lib/language";
import { REPO_URL, REPO_BRANCH } from "@/lib/repo";

type Props = {
  t: UiStrings;
  lang: UiLang;
  onLangChange: (next: UiLang) => void;
  mcpOpen: boolean;
  onMcpOpenChange: (open: boolean) => void;
  aboutOpen: boolean;
  onAboutOpenChange: (open: boolean) => void;
  kbCollapsed: boolean;
  onKbCollapsedChange: (next: boolean | ((prev: boolean) => boolean)) => void;
  /** GitHub URL of the active persona content repo, or null if none configured. */
  contentRepoUrl: string | null;
  /** Base path for API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** When false, MCP button/modal are hidden. Defaults to true. */
  isRootAccount?: boolean;
};

/**
 * Renders the chat shell. Lives in its own file so it can use `useKb()` (only
 * available inside `<KbProvider>` in the page) without forcing a nested
 * component declaration that confuses Next's prerender.
 */
export function HomeShell({
  t,
  lang,
  onLangChange,
  mcpOpen,
  onMcpOpenChange,
  aboutOpen,
  onAboutOpenChange,
  kbCollapsed,
  onKbCollapsedChange,
  contentRepoUrl,
  apiBasePath = "/api",
  isRootAccount = true,
}: Props) {
  const { openFile, cvPrintBase } = useKb();

  const openCv = () => {
    onKbCollapsedChange(false);
    openFile(CV_VIRTUAL_PATH);
  };

  return (
    <>
      <div className="relative z-10 flex h-dvh flex-col">
        <AppTopBar
          lang={lang}
          onLangChange={onLangChange}
          themeToggleLabel={t.themeToggle}
          mcpButtonLabel={isRootAccount ? t.mcp.buttonLabel : undefined}
          onOpenMcp={isRootAccount ? () => onMcpOpenChange(true) : undefined}
          aboutButtonLabel={t.about.buttonLabel}
          onOpenAbout={() => onAboutOpenChange(true)}
          sourceRepo={contentRepoUrl ? { url: contentRepoUrl, label: t.sourceRepoLabel } : null}
          cvButtonLabel={t.kb.openCv}
          onOpenCv={openCv}
          kbCollapsed={kbCollapsed}
          onToggleKb={() => onKbCollapsedChange((c) => !c)}
          kbShowLabel={t.kbPanel.show}
          kbHideLabel={t.kbPanel.hide}
        />

        <KbLayout
          collapsed={kbCollapsed}
          onCollapsedChange={onKbCollapsedChange}
          chat={<Chat t={t} lang={lang} onLangChange={onLangChange} apiBasePath={apiBasePath} />}
          panel={<KbPanel onLangChange={onLangChange} />}
        />
      </div>

      {isRootAccount && (
        <McpModal open={mcpOpen} onClose={() => onMcpOpenChange(false)} strings={t.mcp} />
      )}
      <AboutPopover
        open={aboutOpen}
        onClose={() => onAboutOpenChange(false)}
        strings={{
          title: t.about.title,
          close: t.about.close,
          transparency: t.footer.transparency,
          systemPrompt: t.footer.systemPrompt,
          kb: t.footer.kb,
          repo: t.footer.repo,
          mcpDocs: t.footer.mcpDocs,
          printableCv: t.about.printableCv,
        }}
        repoUrl={REPO_URL}
        branch={REPO_BRANCH}
        cvHref={`${cvPrintBase}/cv?lang=${lang}`}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { HomeShell } from "@/components/home-shell";
import { KbProvider } from "@/components/kb/kb-context";
import type { AllLocaleStrings, UiLang, UiStrings } from "@/lib/language";

type Props = {
  /** Pre-built strings for both locales, computed server-side from persona. */
  strings: AllLocaleStrings;
  /** GitHub URL of the active persona content repo, or null if none configured. */
  contentRepoUrl: string | null;
  /** Branch of the active persona content repo, or null if none configured. */
  contentRepoBranch: string | null;
  /** Base path for API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** Account page base for CV links: "" (→ /cv) or "/{username}". */
  cvPrintBase?: string;
  /** When false, MCP button/modal are hidden. Defaults to true. */
  isRootAccount?: boolean;
  reportHref?: string | null;
  /** Admin dashboard path for the signed-in owner, or null to hide the link. */
  adminHref?: string | null;
};

export function HomePageClient({
  strings,
  contentRepoUrl,
  contentRepoBranch,
  apiBasePath = "/api",
  cvPrintBase = "",
  isRootAccount = true,
  reportHref = null,
  adminHref = null,
}: Props) {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);
  const t = strings[lang] as UiStrings;

  return (
    <KbProvider
      lang={lang}
      kbStrings={t.kb}
      apiBasePath={apiBasePath}
      cvPrintBase={cvPrintBase}
      contentRepoUrl={contentRepoUrl}
      contentRepoBranch={contentRepoBranch}
    >
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
        contentRepoUrl={contentRepoUrl}
        contentRepoBranch={contentRepoBranch}
        apiBasePath={apiBasePath}
        isRootAccount={isRootAccount}
        reportHref={reportHref}
        adminHref={adminHref}
      />
    </KbProvider>
  );
}

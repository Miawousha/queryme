"use client";

import { useState } from "react";
import { useKb } from "@/components/kb/kb-context";
import { assembleCvMarkdown, cvDownloadFilename } from "@/lib/cv/markdown";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils";
import {
  CopyIcon,
  DownloadIcon,
  KbDocToolbar,
  PrintIcon,
  type KbDocAction,
} from "@/components/kb/kb-doc-toolbar";
import { LanguageToggle } from "@/components/language-toggle";
import type { UiLang } from "@/lib/language";
import { CvDocumentClient } from "./cv-document-client";

/**
 * Panel rendering of the synthesized CV document. Mirrors `KbViewer`'s
 * structure (toolbar + scrollable body + focus mode) so it feels like any
 * other document in the KB panel, but with a language toggle and CV-specific
 * actions (copy markdown / download .md / print via `/cv`).
 */
export function CvPanelView({
  onLangChange,
}: {
  onLangChange: (next: UiLang) => void;
}) {
  const { lang, strings, closeFile, apiBasePath, cvPrintBase } = useKb();
  const [focus, setFocus] = useState(false);
  const focusRef = useDialog<HTMLDivElement>(focus, () => setFocus(false));

  async function copyCvMarkdown(): Promise<string> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = await res.json();
    const md = assembleCvMarkdown(kb, lang);
    await navigator.clipboard.writeText(md);
    return strings.copied;
  }

  async function downloadCvMarkdown(): Promise<void> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = await res.json();
    const md = assembleCvMarkdown(kb, lang);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cvDownloadFilename(kb.profile.name, lang);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openPrintView(): void {
    // Open the standalone CV route in a new tab — the print stylesheet there
    // is tuned for A4. Auto-trigger print via the `?print=1` flag.
    window.open(`${cvPrintBase}/cv?lang=${lang}&print=1`, "_blank", "noopener");
  }

  const actions: KbDocAction[] = [
    {
      key: "copy",
      label: strings.copy,
      ariaLabel: strings.copyAria,
      icon: <CopyIcon />,
      onClick: copyCvMarkdown,
    },
    {
      key: "download",
      label: strings.download,
      ariaLabel: strings.downloadAria,
      icon: <DownloadIcon />,
      onClick: downloadCvMarkdown,
    },
    {
      key: "print",
      label: strings.print,
      ariaLabel: strings.printAria,
      icon: <PrintIcon />,
      onClick: openPrintView,
    },
  ];

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={focus ? "dialog" : undefined}
      aria-modal={focus ? "true" : undefined}
      aria-label={focus ? strings.cv : undefined}
      className={cn(
        "flex flex-col outline-none",
        focus ? "fixed inset-0 z-50 bg-[var(--color-background)] p-4 sm:p-8" : "h-full",
      )}
    >
      <KbDocToolbar
        title={strings.cv}
        typeBadge="CV"
        backLabel={strings.back}
        onBack={closeFile}
        actions={actions}
        focused={focus}
        onToggleFocus={() => setFocus((v) => !v)}
        expandLabel={strings.expandFocus}
        minimizeLabel={strings.exitFocus}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-end">
          <LanguageToggle value={lang} onChange={onLangChange} />
        </div>
        <CvDocumentClient lang={lang} />
      </div>
    </div>
  );
}

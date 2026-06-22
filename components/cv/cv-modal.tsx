"use client";

import { useState, type ReactNode } from "react";
import { useKb } from "@/components/kb/kb-context";
import { useDialog } from "@/lib/use-dialog";
import { LanguageToggle } from "@/components/language-toggle";
import { DownloadIcon, PrintIcon, type KbDocAction } from "@/components/kb/kb-doc-toolbar";
import { assembleCvMarkdown, cvDownloadFilename } from "@/lib/cv/markdown";
import { CvDocumentClient } from "./cv-document-client";
import type { Kb } from "@/lib/kb/loader";
import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";
import "./print.css";

export function CvModal({
  open,
  onClose,
  onLangChange,
}: {
  open: boolean;
  onClose: () => void;
  onLangChange: (next: UiLang) => void;
}) {
  const { lang, strings, apiBasePath, cvPrintBase } = useKb();
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);

  if (!open) return null;

  async function fetchCvKb(): Promise<Kb> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = (await res.json()) as { kb: Kb };
    return kb;
  }

  async function downloadCv(): Promise<void> {
    const kb = await fetchCvKb();
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

  async function shareCv(): Promise<string | void> {
    const shareUrl = `${window.location.origin}${cvPrintBase}/cv?lang=${lang}`;
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    try {
      const kb = await fetchCvKb();
      const title = `${kb.profile.name} — CV`;
      const file = new File([assembleCvMarkdown(kb, lang)], cvDownloadFilename(kb.profile.name, lang), {
        type: "text/markdown",
      });
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ title, url: shareUrl, files: [file] });
        return;
      }
      if (nav.share) {
        await nav.share({ title, url: shareUrl });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user cancelled the share sheet
      // any other failure → fall through to clipboard
    }
    await navigator.clipboard.writeText(shareUrl);
    return strings.copied;
  }

  function printCv(): void {
    // Open the standalone CV with the A4 print stylesheet; ?print=1 auto-fires print.
    window.open(`${cvPrintBase}/cv?lang=${lang}&print=1`, "_blank", "noopener");
  }

  const actions: KbDocAction[] = [
    { key: "download", label: strings.download, ariaLabel: strings.downloadAria, icon: <DownloadIcon />, onClick: downloadCv },
    { key: "share", label: strings.share, ariaLabel: strings.shareAria, icon: <ShareIcon />, onClick: shareCv },
    { key: "print", label: strings.print, ariaLabel: strings.printAria, icon: <PrintIcon />, onClick: printCv },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cv-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <h2
            id="cv-modal-title"
            className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {strings.cv}
          </h2>
          <LanguageToggle value={lang} onChange={onLangChange} />
          <div className="flex items-center gap-1.5">
            {actions.map((a) => (
              <ModalAction key={a.key} action={a} />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.close}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
          <CvDocumentClient lang={lang} />
        </div>
      </div>
    </div>
  );
}

/** Toolbar button with the transient feedback state (e.g. "Copied"), mirroring
 * the KB doc toolbar's ActionButton (which isn't exported). */
function ModalAction({ action }: { action: KbDocAction }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await action.onClick();
        if (typeof result === "string") {
          setFeedback(result);
          setTimeout(() => setFeedback(null), 1500);
        }
      }}
      aria-label={action.ariaLabel}
      title={feedback ?? action.label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
        feedback
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]",
      )}
    >
      {action.icon as ReactNode}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

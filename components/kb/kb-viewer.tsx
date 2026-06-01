"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { KbFile } from "@/lib/kb/manifest";
import { KbMetaCard } from "@/components/kb/kb-meta-card";
import { useKb } from "@/components/kb/kb-context";
import {
  CopyIcon,
  DownloadIcon,
  GithubIcon,
  InfoIcon,
  KbDocToolbar,
  PrintIcon,
  type KbDocAction,
} from "@/components/kb/kb-doc-toolbar";
import { useDialog } from "@/lib/use-dialog";
import { REPO_URL, REPO_BRANCH } from "@/lib/repo";
import { cn } from "@/lib/utils";

/** Strips a leading YAML frontmatter block so it never reaches the renderer. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function fileUrl(apiBasePath: string, path: string): string {
  return `${apiBasePath}/kb/file?path=${encodeURIComponent(path)}`;
}

export function KbViewer({ file, onBack }: { file: KbFile; onBack: () => void }) {
  const { strings, apiBasePath } = useKb();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [focus, setFocus] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  // md and yaml are fetched as text and rendered inline; html and pdf are
  // loaded directly by an <iframe> from the file endpoint.
  const needsText = file.type === "md" || file.type === "yaml";

  useEffect(() => {
    setFocus(false);
    setShowMeta(false);
  }, [file.path]);

  useEffect(() => {
    if (!needsText) return;
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(fileUrl(apiBasePath, file.path))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("load failed"))))
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file.path, needsText]);

  // In focus mode the viewer is a full-screen overlay — treat it as a modal
  // dialog (focus trap + restore + Escape). Inert when focus is false.
  const focusRef = useDialog<HTMLDivElement>(focus, () => setFocus(false));

  const actions = useMemo<KbDocAction[]>(() => {
    const list: KbDocAction[] = [];
    if (needsText) {
      list.push({
        key: "copy",
        label: strings.copy,
        ariaLabel: strings.copyAria,
        icon: <CopyIcon />,
        onClick: async () => {
          if (!text) return;
          await navigator.clipboard.writeText(text);
          return strings.copied;
        },
      });
    }
    list.push({
      key: "download",
      label: strings.download,
      ariaLabel: strings.downloadAria,
      icon: <DownloadIcon />,
      onClick: () => {
        const a = document.createElement("a");
        a.href = fileUrl(apiBasePath, file.path);
        a.download = file.path.split("/").pop() ?? "document";
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    });
    list.push({
      key: "print",
      label: strings.print,
      ariaLabel: strings.printAria,
      icon: <PrintIcon />,
      onClick: () => window.print(),
    });
    if (file.meta) {
      list.push({
        key: "details",
        label: strings.details,
        ariaLabel: showMeta ? strings.hideDetails : strings.showDetails,
        icon: <InfoIcon />,
        onClick: () => {
          setShowMeta((v) => !v);
        },
      });
    }
    list.push({
      key: "github",
      label: strings.github,
      ariaLabel: strings.github,
      icon: <GithubIcon />,
      onClick: () => {
        window.open(
          `${REPO_URL.replace(/\/$/, "")}/blob/${REPO_BRANCH}/kb/${file.path}`,
          "_blank",
          "noopener",
        );
      },
    });
    return list;
  }, [needsText, text, file, strings, showMeta]);

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={focus ? "dialog" : undefined}
      aria-modal={focus ? "true" : undefined}
      aria-label={focus ? file.title : undefined}
      className={cn(
        "flex flex-col outline-none",
        focus
          ? "fixed inset-0 z-50 bg-[var(--color-background)] p-4 sm:p-8"
          : "h-full",
      )}
    >
      <KbDocToolbar
        title={file.title}
        typeBadge={file.type}
        backLabel={strings.back}
        onBack={onBack}
        actions={actions}
        focused={focus}
        onToggleFocus={() => setFocus((v) => !v)}
        expandLabel={strings.expandFocus}
        minimizeLabel={strings.exitFocus}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {showMeta && file.meta && <KbMetaCard meta={file.meta} />}

        {error && <p className="text-xs text-red-500">{strings.loadError}</p>}

        {needsText && !error && text === null && (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.loading}</p>
        )}

        {file.type === "md" && text !== null && (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {stripFrontmatter(text)}
            </ReactMarkdown>
          </div>
        )}

        {file.type === "yaml" && text !== null && (
          <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 font-mono text-[12px] leading-relaxed text-[var(--color-text-primary)]">
            {text}
          </pre>
        )}

        {file.type === "html" && (
          <iframe
            title={file.title}
            src={fileUrl(apiBasePath, file.path)}
            sandbox=""
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)] bg-white"
          />
        )}

        {file.type === "pdf" && (
          <iframe
            title={file.title}
            src={fileUrl(apiBasePath, file.path)}
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)]"
          />
        )}
      </div>
    </div>
  );
}

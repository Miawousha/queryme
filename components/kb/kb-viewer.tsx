"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { KbFile } from "@/lib/kb/manifest";
import { KbMetaCard } from "@/components/kb/kb-meta-card";
import { useKb } from "@/components/kb/kb-context";
import { useDialog } from "@/lib/use-dialog";
import { REPO_URL, REPO_BRANCH } from "@/lib/repo";
import { cn } from "@/lib/utils";

/** Strips a leading YAML frontmatter block so it never reaches the renderer. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function fileUrl(path: string): string {
  return `/api/kb/file?path=${encodeURIComponent(path)}`;
}

export function KbViewer({ file, onBack }: { file: KbFile; onBack: () => void }) {
  const { strings } = useKb();
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
    fetch(fileUrl(file.path))
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
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={strings.backToList}
          className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
          style={{ letterSpacing: "0.2em" }}
        >
          ‹ {strings.back}
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-primary)]">
          {file.title}
        </span>
        <span
          className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
          style={{ letterSpacing: "0.16em" }}
        >
          {file.type}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {file.meta && (
            <button
              type="button"
              onClick={() => setShowMeta((v) => !v)}
              aria-label={showMeta ? strings.hideDetails : strings.showDetails}
              aria-pressed={showMeta}
              title={strings.details}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                showMeta
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]",
              )}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
          )}
          <a
            href={`${REPO_URL.replace(/\/$/, "")}/blob/${REPO_BRANCH}/kb/${file.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ letterSpacing: "0.2em" }}
          >
            {strings.github}
          </a>
          <button
            type="button"
            onClick={() => setFocus((v) => !v)}
            aria-label={focus ? strings.exitFocus : strings.expandFocus}
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ letterSpacing: "0.2em" }}
          >
            {focus ? strings.minimize : strings.expand}
          </button>
        </div>
      </div>

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
            src={fileUrl(file.path)}
            sandbox=""
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)] bg-white"
          />
        )}

        {file.type === "pdf" && (
          <iframe
            title={file.title}
            src={fileUrl(file.path)}
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)]"
          />
        )}
      </div>
    </div>
  );
}

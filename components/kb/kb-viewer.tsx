"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { anchorMatches, slugify } from "@/lib/kb/slug";
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

function fileUrl(apiBasePath: string, path: string, lang: string): string {
  return `${apiBasePath}/kb/file?path=${encodeURIComponent(path)}&lang=${lang}`;
}

/** Recursively extract text content from a React node tree. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function KbViewer({
  file,
  anchor = null,
  citedRefs = [],
  breadcrumb = [],
  onBack,
}: {
  file: KbFile;
  /** Scroll target section slug — jump to a heading on open. */
  anchor?: string | null;
  /** Citation refs for this doc — cited sections get persistent markers. */
  citedRefs?: CitedRef[];
  /** Breadcrumb path labels shown muted before the doc title. */
  breadcrumb?: string[];
  onBack: () => void;
}) {
  const { strings, apiBasePath, lang } = useKb();
  const contentRef = useRef<HTMLDivElement>(null);
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
    fetch(fileUrl(apiBasePath, file.path, lang))
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
  }, [file.path, needsText, lang]);

  // In focus mode the viewer is a full-screen overlay — treat it as a modal
  // dialog (focus trap + restore + Escape). Inert when focus is false.
  const focusRef = useDialog<HTMLDivElement>(focus, () => setFocus(false));

  // Cited-section chips: first index per section across all citedRefs for this file.
  const sectionChips = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of citedRefs) {
      if (r.path !== file.path || !r.anchor) continue;
      const sec = file.sections?.find((s) => anchorMatches(r.anchor!, s.slug));
      if (sec && !map.has(sec.slug)) map.set(sec.slug, r.index);
    }
    return map;
  }, [citedRefs, file]);

  // Stable jump helper — used both by the toolbar outline dropdown and the
  // open-at-anchor effect below.
  const jumpTo = useCallback((slug: string) => {
    const el = contentRef.current?.querySelector(`[id="${CSS.escape(slug)}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("kb-flash-target");
    setTimeout(() => el.classList.remove("kb-flash-target"), 1600);
  }, []);

  // Opening from a citation: once the markdown is on screen, scroll to the
  // cited section and flash it. Unmatched anchors degrade to the top.
  useEffect(() => {
    if (!anchor || file.type !== "md" || text === null) return;
    const target = file.sections?.find((s) => anchorMatches(anchor, s.slug));
    if (!target) return;
    // One-tick defer so ReactMarkdown's headings are committed. setTimeout
    // (not requestAnimationFrame): rAF never fires in hidden documents, which
    // would silently skip the jump for background tabs.
    const timer = setTimeout(() => jumpTo(target.slug), 0);
    return () => clearTimeout(timer);
  }, [anchor, file, text, jumpTo]);

  // Heading renderers with ids + persistent cited markers.
  // Heading ids come from the shared slugger so citation anchors, manifest
  // sections, and DOM ids all agree. Duplicate headings share one id (the
  // first wins on jump) — extractSections' -1 suffixes are a tree-only
  // disambiguation, acceptable degradation for in-page jumps.
  const mdComponents = useMemo(() => {
    const heading = (Tag: "h2" | "h3") =>
      function Heading({ children }: { children?: ReactNode }) {
        const slug = slugify(textOf(children));
        const chip = sectionChips.get(slug);
        return (
          <Tag
            id={slug || undefined}
            className={chip !== undefined ? "kb-cited-section" : undefined}
          >
            {children}
            {chip !== undefined && (
              <span className="kb-chip"> [{chip}]</span>
            )}
          </Tag>
        );
      };
    return { h2: heading("h2"), h3: heading("h3") };
  }, [sectionChips]);

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
        a.href = fileUrl(apiBasePath, file.path, lang);
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
        breadcrumb={breadcrumb}
        outline={file.sections?.map((s) => ({ ...s, chip: sectionChips.get(s.slug) }))}
        onJumpTo={jumpTo}
        outlineLabel={strings.outline}
        outlineAria={strings.outlineAria}
      />

      <div ref={contentRef} className="min-h-0 flex-1 overflow-auto p-4">
        {showMeta && file.meta && <KbMetaCard meta={file.meta} />}

        {error && <p className="text-xs text-red-500">{strings.loadError}</p>}

        {needsText && !error && text === null && (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.loading}</p>
        )}

        {file.type === "md" && text !== null && (
          <div className="prose-chat">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={mdComponents}
            >
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
            src={fileUrl(apiBasePath, file.path, lang)}
            sandbox=""
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)] bg-white"
          />
        )}

        {file.type === "pdf" && (
          <iframe
            title={file.title}
            src={fileUrl(apiBasePath, file.path, lang)}
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)]"
          />
        )}
      </div>
    </div>
  );
}

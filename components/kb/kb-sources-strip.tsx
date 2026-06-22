"use client";

import { useMemo, useState } from "react";
import { useKb } from "@/components/kb/kb-context";
import { anchorMatches } from "@/lib/kb/slug";

const LABEL = "font-mono text-2xs uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

type Row = { index: number; path: string; anchor: string | null; docTitle: string; sectionTitle?: string };

/** Auto-shown strip above the tree listing the sources the latest answer cited.
 * Hidden when the latest answer cited nothing browseable. */
export function KbSourcesStrip() {
  const { latestAnswer, manifest, openFile, strings, apiBasePath } = useKb();
  const storageKey = `queritae:kbSources:${apiBasePath}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const rows = useMemo<Row[]>(() => {
    if (!latestAnswer) return [];
    return latestAnswer.refs
      .map((r): Row | null => {
        const file = manifest.find((f) => f.path === r.path);
        if (!file) return null;
        const section = r.anchor
          ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug))
          : undefined;
        return { index: r.index, path: r.path, anchor: r.anchor, docTitle: file.title, sectionTitle: section?.title };
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => a.index - b.index);
  }, [latestAnswer, manifest]);

  if (rows.length === 0) return null;

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  return (
    <div className="mb-2 rounded border border-[rgba(var(--color-accent-rgb),0.25)] bg-[rgba(var(--color-accent-rgb),0.05)]">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? strings.sourcesExpand : strings.sourcesCollapse}
        onClick={toggle}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-[rgba(var(--color-accent-rgb),0.08)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
      >
        <span className={LABEL} style={{ ...LABEL_STYLE, color: "var(--color-accent)" }}>
          {strings.sourcesTitle}
        </span>
        <span className={LABEL} style={LABEL_STYLE}>
          {rows.length}
        </span>
      </button>
      {!collapsed && (
        <ul className="flex flex-col gap-0.5 px-1 pb-1.5">
          {rows.map((r) => (
            <li key={`${r.path}#${r.anchor ?? ""}`}>
              <button
                type="button"
                onClick={() => openFile(r.path, r.anchor)}
                className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
              >
                <span className="kb-chip shrink-0">[{r.index}]</span>
                <span className="min-w-0 flex-1 truncate text-control text-[var(--color-text-secondary)]">
                  {r.docTitle}
                  {r.sectionTitle && (
                    <span className="text-[var(--color-text-tertiary)]"> › {r.sectionTitle}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

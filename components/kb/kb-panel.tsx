"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useKb } from "@/components/kb/kb-context";
import { KbTree } from "@/components/kb/kb-tree";
import { KbSourcesStrip } from "@/components/kb/kb-sources-strip";
import { KbViewer } from "@/components/kb/kb-viewer";
import { useKbDensity } from "@/lib/kb/use-kb-density";
import { breadcrumbFor, resolveGroups } from "@/lib/kb/tree";
import { cn } from "@/lib/utils";

/** Shared top-band style — matches the chat pane's status header height. */
const BAND = "flex h-11 shrink-0 items-center gap-2 border-b border-dashed border-[var(--color-border)] px-4";
const LABEL_STYLE = { letterSpacing: "0.14em" };

export function KbPanel() {
  const {
    strings,
    lang,
    manifest,
    groups: configGroups,
    citedRefs,
    openTarget,
    openFile,
    closeFile,
    apiBasePath,
  } = useKb();

  const groups = useMemo(
    () =>
      resolveGroups(
        configGroups,
        lang,
        strings.sections as Record<string, string | undefined>,
        strings.sections.other,
      ),
    [configGroups, lang, strings],
  );

  const [filter, setFilter] = useState("");
  const [lens, setLens] = useState(false);
  const [density, toggleDensity] = useKbDensity();
  const filterInputRef = useRef<HTMLInputElement>(null);

  const realFiles = manifest.filter((f) => !f.path.startsWith("_virtual/"));
  const lensCount = citedRefs.filter((r) => realFiles.some((f) => f.path === r.path)).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `queritae:kbTreeScroll:${apiBasePath}`;

  // Restore the tree's scroll position when returning from the viewer (the
  // tree column is display:none while a doc fills a narrow pane).
  useLayoutEffect(() => {
    if (openTarget !== null) return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      el.scrollTop = Number(window.sessionStorage.getItem(scrollKey) ?? 0);
    } catch {
      /* storage unavailable */
    }
  }, [openTarget, scrollKey]);

  const openFileEntry = openTarget ? manifest.find((f) => f.path === openTarget.path) ?? null : null;
  const docOpen = openTarget !== null;

  // Document pane: the viewer, or a dead-end when the path is missing from
  // the manifest. Sits RIGHT of the tree so the tree stays usable for
  // navigation; when the panel is too narrow for both (mobile drawer, a
  // narrow desktop pane) the tree column hides and the doc takes the pane.
  const docPane = openTarget === null ? null : openFileEntry ? (
    <KbViewer
      file={openFileEntry}
      anchor={openTarget.anchor}
      citedRefs={citedRefs}
      breadcrumb={breadcrumbFor(openFileEntry.path, groups, strings.sections.other)}
      onBack={closeFile}
      closeLabel={strings.close}
    />
  ) : (
    <>
      <div className={BAND}>
        <button
          type="button"
          onClick={closeFile}
          aria-label={strings.backToList}
          className="shrink-0 whitespace-nowrap font-mono text-2xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] @min-[36rem]:hidden"
          style={{ letterSpacing: "0.14em" }}
        >
          ‹ {strings.back}
        </button>
        <button
          type="button"
          onClick={closeFile}
          aria-label={strings.close}
          className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-2xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] @min-[36rem]:inline"
          style={{ letterSpacing: "0.14em" }}
        >
          {strings.close} ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-xs text-[var(--color-text-tertiary)]">{strings.notInKb}</p>
      </div>
    </>
  );

  return (
    <aside className="@container flex h-full overflow-hidden">
      <div
        className={cn(
          "min-w-0 flex-col overflow-hidden",
          docOpen
            ? "hidden w-[clamp(15rem,34%,24rem)] shrink-0 border-r border-[var(--color-border)] @min-[36rem]:flex"
            : "flex flex-1",
        )}
      >
      <div className={BAND}>
        <span className="flex min-w-0 items-center gap-2 whitespace-nowrap font-heading text-label uppercase tracking-[0.14em] text-[var(--color-text-primary)]">
          <span aria-hidden className="text-[var(--color-brand)]">
            ✦
          </span>
          <span className="truncate">{strings.title}</span>
        </span>
        {/* Beside an open doc the tree column is narrow: drop the count and
            shorten the lens button to its ◆ number so the band stays one line. */}
        {!docOpen && (
          <span className="whitespace-nowrap font-heading text-label uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            {"// "}
            {manifest.length}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={lens}
            aria-label={strings.referencedLensAria}
            disabled={lensCount === 0}
            onClick={() => setLens((v) => !v)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 font-mono text-2xs uppercase transition-colors",
              lens
                ? "border-[rgba(var(--color-accent-rgb),0.6)] bg-[rgba(var(--color-accent-rgb),0.1)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)]",
              lensCount === 0 && "cursor-not-allowed opacity-40",
            )}
            style={LABEL_STYLE}
          >
            <span aria-hidden>◆</span> {lensCount}
            {!docOpen && <> {strings.referencedLens}</>}
          </button>
          <button
            type="button"
            aria-label={strings.densityLabel}
            aria-pressed={density === "comfortable"}
            onClick={toggleDensity}
            className="shrink-0 rounded border border-[var(--color-border)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {density === "comfortable" ? (
                <>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </>
              ) : (
                <>
                  <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Full-width filter row */}
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0 text-[var(--color-text-tertiary)]">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={filterInputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={strings.filterPlaceholder}
            aria-label={strings.filterPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter !== "") {
                e.stopPropagation();
                setFilter("");
              }
            }}
            className="flex-1 bg-transparent py-1.5 text-xs text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />
          {filter !== "" && (
            <button
              type="button"
              aria-label={strings.clearFilter}
              onClick={() => {
                setFilter("");
                filterInputRef.current?.focus();
              }}
              className="shrink-0 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        data-kb-density={density}
        className="min-h-0 flex-1 overflow-auto p-4"
        onScroll={(e) => {
          try {
            window.sessionStorage.setItem(scrollKey, String(Math.round(e.currentTarget.scrollTop)));
          } catch {
            /* storage unavailable */
          }
        }}
      >
        <KbSourcesStrip />
        <KbTree
          manifest={manifest}
          citedRefs={citedRefs}
          onOpen={openFile}
          filter={filter}
          lens={lens}
          active={openFileEntry ? openTarget : null}
        />
      </div>
      </div>
      {docPane && <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{docPane}</div>}
    </aside>
  );
}

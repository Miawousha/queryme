"use client";

import { useCallback, useMemo, useRef } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { useKb } from "@/components/kb/kb-context";
import { useKbTreeState } from "@/components/kb/use-kb-tree-state";
import { buildKbTree, resolveGroups, type KbTreeNode } from "@/lib/kb/tree";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

function Chips({ chips }: { chips: number[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {chips.map((n) => (
        <span key={n} className="kb-chip">
          [{n}]
        </span>
      ))}
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0 transition-transform", open && "rotate-90")}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

type RowCtx = {
  searchMode: boolean;
  isExpanded: (node: KbTreeNode) => boolean;
  toggle: (node: KbTreeNode) => void;
  pulseId: string | null;
  onOpen: (path: string, anchor?: string | null) => void;
  expandLabel: string;
  collapseLabel: string;
};

function Row({ node, depth, ctx }: { node: KbTreeNode; depth: number; ctx: RowCtx }) {
  const open = ctx.searchMode || ctx.isExpanded(node);
  const isCited = node.chips.length > 0;
  const isPulse = ctx.pulseId === node.id;

  const rowKeyDown = (e: React.KeyboardEvent) => {
    if (ctx.searchMode) return;
    // Only expandable nodes react to arrow keys.
    if (node.kind === "section") return;
    if (e.key === "ArrowRight" && node.children.length > 0 && !open) {
      e.preventDefault();
      ctx.toggle(node);
    } else if (e.key === "ArrowLeft" && node.children.length > 0 && open && !ctx.searchMode) {
      e.preventDefault();
      ctx.toggle(node);
    }
  };

  if (node.kind === "collection" || node.kind === "folder") {
    return (
      <>
        <button
          type="button"
          data-kb-row=""
          aria-expanded={open}
          style={{ paddingLeft: depth * 14 }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors",
            "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
            isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
            isPulse && "kb-pulse",
          )}
          onClick={() => ctx.toggle(node)}
          onKeyDown={rowKeyDown}
        >
          <Chevron open={open} />
          <span className={LABEL} style={LABEL_STYLE}>
            {node.label}
          </span>
          {node.count !== undefined && node.count > 0 && (
            <span className={LABEL} style={LABEL_STYLE}>
              {node.count}
            </span>
          )}
          {!open && node.dot && <Dot />}
          <Chips chips={node.chips} />
        </button>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} ctx={ctx} />)}
      </>
    );
  }

  if (node.kind === "doc") {
    const hasChildren = node.children.length > 0;
    return (
      <>
        <div
          style={{ paddingLeft: depth * 14 }}
          className={cn(
            "flex items-center gap-0.5 rounded",
            isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
            isPulse && "kb-pulse",
          )}
        >
          {/* Chevron toggle — separate button to avoid nested-button violation */}
          <button
            type="button"
            aria-label={open ? ctx.collapseLabel : ctx.expandLabel}
            aria-expanded={open}
            disabled={ctx.searchMode || !hasChildren}
            className={cn(
              "shrink-0 rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
              !hasChildren && "invisible pointer-events-none",
            )}
            onClick={() => ctx.toggle(node)}
          >
            <Chevron open={open} />
          </button>
          {/* Main open-file button */}
          <button
            type="button"
            data-kb-row=""
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left transition-colors",
              "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
            )}
            onClick={() => ctx.onOpen(node.path!, null)}
            onKeyDown={rowKeyDown}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate text-[13px]",
                  isCited
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)]",
                )}
              >
                {node.label}
              </span>
              {node.subtitle && (
                <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                  {node.subtitle}
                </span>
              )}
            </span>
            <Chips chips={node.chips} />
            {!open && node.dot && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
              />
            )}
            <span
              className="ml-1 shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
              style={{ letterSpacing: "0.16em" }}
            >
              {node.fileType}
            </span>
          </button>
        </div>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} ctx={ctx} />)}
      </>
    );
  }

  // section
  return (
    <button
      type="button"
      data-kb-row=""
      style={{ paddingLeft: depth * 14 }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left transition-colors",
        "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
        isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
        isPulse && "kb-pulse",
      )}
      onClick={() => ctx.onOpen(node.path!, node.anchor ?? null)}
      onKeyDown={rowKeyDown}
    >
      <span aria-hidden className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
        #
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px]",
          isCited
            ? "text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)]",
        )}
      >
        {node.label}
      </span>
      <Chips chips={node.chips} />
    </button>
  );
}

export function KbTree({
  manifest,
  citedRefs,
  onOpen,
}: {
  manifest: KbFile[];
  citedRefs: CitedRef[];
  onOpen: (path: string, anchor?: string | null) => void;
}) {
  const { strings, lang, groups: configGroups, apiBasePath } = useKb();
  const filterRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pinned = manifest.filter((f) => f.path.startsWith("_virtual/"));
  const files = useMemo(
    () => manifest.filter((f) => !f.path.startsWith("_virtual/")),
    [manifest],
  );

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

  const groupNames = useMemo(
    () => new Set(groups.filter((g) => g.name !== "other").map((g) => g.name)),
    [groups],
  );

  const { isExpanded, toggle, filter, setFilter, lens, setLens, pulseId } = useKbTreeState({
    storageKey: `queritae:kbTree:${apiBasePath}`,
    files,
    citedRefs,
    groupNames,
  });

  const tree = useMemo(
    () => buildKbTree({ files, groups, citedRefs, filter, lens }),
    [files, groups, citedRefs, filter, lens],
  );

  // Filter/lens prune the tree small — render it fully expanded so matches
  // are visible without clicks. Normal mode uses the expansion overrides.
  const searchMode = filter.trim() !== "" || lens;

  const ctx: RowCtx = {
    searchMode,
    isExpanded,
    toggle,
    pulseId,
    onOpen,
    expandLabel: strings.expandGroup,
    collapseLabel: strings.collapseGroup,
  };

  const containerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "/" && document.activeElement !== filterRef.current) {
      e.preventDefault();
      filterRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rows = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>("[data-kb-row]") ?? [],
      );
      const idx = rows.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
      if (next >= 0 && next < rows.length) {
        e.preventDefault();
        rows[next].focus();
      }
    }
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-2" onKeyDown={containerKeyDown}>
      {/* Filter row: text input + cited-lens toggle */}
      <div className="flex gap-2">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={strings.filterPlaceholder}
          aria-label={strings.filterPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFilter("");
          }}
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[12px] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-hover)] focus:outline-none"
        />
        <button
          type="button"
          aria-pressed={lens}
          aria-label={strings.referencedLensAria}
          disabled={citedRefs.length === 0}
          onClick={() => setLens(!lens)}
          className={cn(
            "shrink-0 rounded border px-2 py-1 font-mono text-[10px] transition-colors",
            LABEL,
            lens
              ? "border-[rgba(var(--color-accent-rgb),0.6)] bg-[rgba(var(--color-accent-rgb),0.1)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
            citedRefs.length === 0 && "cursor-not-allowed opacity-40",
          )}
          style={LABEL_STYLE}
        >
          {strings.referencedLens} · {citedRefs.length}
        </button>
      </div>

      {/* Pinned (_virtual/) rows — hidden while filter/lens is active */}
      {!searchMode && pinned.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-2">
          {pinned.map((f) => (
            <button
              key={f.path}
              type="button"
              data-kb-row=""
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
              onClick={() => onOpen(f.path, null)}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-secondary)]">
                {f.title}
              </span>
              <span
                className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.16em" }}
              >
                {f.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tree rows or empty state */}
      {files.length === 0 ? (
        <p className="px-1 text-xs text-[var(--color-text-tertiary)]">{strings.unavailable}</p>
      ) : tree.length > 0 ? (
        <div className="flex flex-col">
          {tree.map((node) => (
            <Row key={node.id} node={node} depth={0} ctx={ctx} />
          ))}
        </div>
      ) : searchMode ? (
        <div className="flex flex-col gap-2 px-1 py-1">
          <p className="text-[12px] text-[var(--color-text-tertiary)]">{strings.noMatches}</p>
          {filter !== "" && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="w-fit text-[12px] text-[var(--color-accent)] hover:underline"
            >
              {strings.clearFilter}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

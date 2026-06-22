"use client";

import { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { useKb } from "@/components/kb/kb-context";
import { KbFileGlyph } from "@/components/kb/kb-file-glyph";
import { useKbTreeState } from "@/components/kb/use-kb-tree-state";
import { useKbPeek } from "@/lib/kb/use-kb-peek";
import { KbPeek } from "@/components/kb/kb-peek";
import type { PeekTarget } from "@/lib/kb/peek-extract";
import { buildKbTree, resolveGroups, type KbChip, type KbTreeNode } from "@/lib/kb/tree";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-control uppercase text-[var(--color-text-secondary)]";
const LABEL_STYLE = { letterSpacing: "0.18em" };

/**
 * Citation chip buttons: clicking `[n]` scrolls the chat to the citing
 * message. Rendered as SIBLINGS of the row button, never inside it —
 * interactive descendants of a button are invalid HTML/ARIA.
 */
function ChipButtons({
  chips,
  jumpToMessage,
  labelTemplate,
}: {
  chips: KbChip[];
  jumpToMessage: (messageId: string) => void;
  /** Localized aria-label template; `{n}` is the citation number. */
  labelTemplate: string;
}) {
  if (chips.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {chips.map((c) => (
        <button
          key={c.index}
          type="button"
          aria-label={labelTemplate.replace("{n}", String(c.index))}
          onClick={() => jumpToMessage(c.messageId)}
          className="kb-chip cursor-pointer rounded border border-[rgba(var(--color-accent-rgb),0.3)] bg-[rgba(var(--color-accent-rgb),0.1)] px-1 leading-tight transition-colors hover:bg-[rgba(var(--color-accent-rgb),0.2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
        >
          [{c.index}]
        </button>
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

/** Wraps the first case-insensitive occurrence of needle in a highlight span. */
function highlightMatch(label: string, needle: string): ReactNode {
  if (!needle) return label;
  const i = label.toLowerCase().indexOf(needle);
  if (i === -1) return label;
  return (
    <>
      {label.slice(0, i)}
      <span className="rounded-[2px] bg-[rgba(var(--color-accent-rgb),0.28)]">
        {label.slice(i, i + needle.length)}
      </span>
      {label.slice(i + needle.length)}
    </>
  );
}

/** Faint vertical indent guides, one per ancestor level. The segment at
 * `trailLevel` (the cited branch's indent) renders in accent — the trail rail.
 * Each row draws its own segments; stacked rows form continuous lines. A row
 * that itself starts the trail sits at `trailLevel === depth`, so we render one
 * segment past its own depth to mark the cited row, not only its descendants. */
function GuideRails({ depth, trailLevel }: { depth: number; trailLevel: number | null }) {
  if (depth === 0 && trailLevel === null) return null;
  const count = Math.max(depth, trailLevel === null ? 0 : trailLevel + 1);
  if (count === 0) return null;
  const levels = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      {levels.map((i) => (
        <span
          key={i}
          aria-hidden
          data-kb-trail={i === trailLevel ? "" : undefined}
          className="pointer-events-none absolute top-0 bottom-0"
          style={{
            left: i * 14 + 11,
            background:
              i === trailLevel
                ? "var(--color-accent)"
                : "rgba(var(--color-text-primary-rgb), 0.08)",
            width: i === trailLevel ? 2 : 1,
          }}
        />
      ))}
    </>
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
  /** Chip click → scroll the chat to the citing message. */
  jumpToMessage: (messageId: string) => void;
  expandLabel: string;
  collapseLabel: string;
  /** Localized chip aria-label template; `{n}` is the citation number. */
  citationJumpLabel: string;
  /** Trimmed, lowercased filter text; empty string when filter is off. */
  needle: string;
  /** Hover/focus intent → show the peek card for this node's doc/section. */
  peekShow: (el: HTMLElement, node: KbTreeNode) => void;
  /** Pointer/focus left a peekable row → schedule the card's dismissal. */
  peekHide: () => void;
  /** Indent level of the nearest enclosing cited+open doc, or null. */
  trailLevel?: number | null;
};

function Row({ node, depth, ctx }: { node: KbTreeNode; depth: number; ctx: RowCtx }) {
  const open = ctx.searchMode || ctx.isExpanded(node);
  const isCited = node.chips.length > 0;
  const isPulse = ctx.pulseId === node.id;

  const trailLevel = ctx.trailLevel ?? null;
  // A cited+open doc starts a trail at its own depth for its descendants and itself.
  const startsTrail = node.kind === "doc" && open && (node.chips.length > 0 || node.dot);
  const selfTrail = startsTrail ? depth : trailLevel;
  const childCtx: RowCtx = startsTrail ? { ...ctx, trailLevel: depth } : ctx;

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
            "relative flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors",
            "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
            isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
            isPulse && "kb-pulse",
          )}
          onClick={() => ctx.toggle(node)}
          onKeyDown={rowKeyDown}
        >
          <GuideRails depth={depth} trailLevel={selfTrail} />
          <Chevron open={open} />
          <span className={LABEL} style={LABEL_STYLE}>
            {highlightMatch(node.label, ctx.needle)}
          </span>
          {node.count !== undefined && node.count > 0 && (
            <span className={LABEL} style={LABEL_STYLE}>
              {node.count}
            </span>
          )}
          {/* Containers never carry chips — citations pin to doc/section
              nodes (collapsed cited descendants surface as the dot). */}
          {!open && node.dot && <Dot />}
        </button>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} ctx={childCtx} />)}
      </>
    );
  }

  if (node.kind === "doc") {
    const hasChildren = node.children.length > 0;
    const label = (
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-control text-[var(--color-text-primary)]">
          {highlightMatch(node.label, ctx.needle)}
        </span>
        {node.subtitle && (
          <span className="truncate text-2xs text-[var(--color-text-tertiary)]">
            {highlightMatch(node.subtitle, ctx.needle)}
          </span>
        )}
      </span>
    );
    const dot = !open && node.dot && (
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
      />
    );
    // Glyph swap (Task 4): md renders nothing; other types get a small line
    // glyph. The glyph is aria-hidden, so a sr-only label keeps the file type
    // in the row's accessible name for non-markdown docs.
    const typeBadge = node.fileType && node.fileType !== "md" && (
      <>
        <span className="sr-only">{node.fileType}</span>
        <KbFileGlyph type={node.fileType} className="ml-1" />
      </>
    );
    return (
      <>
        <div
          style={{ paddingLeft: depth * 14 }}
          className={cn(
            "relative flex items-center gap-0.5 rounded",
            isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
            isPulse && "kb-pulse",
          )}
        >
          <GuideRails depth={depth} trailLevel={selfTrail} />
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
          {/* Main open-file button. Cited rows pull the chip buttons (and the
              trailing dot/type meta, to keep the visual order label → chips →
              dot → type) OUT of the button — chips are interactive and must
              not nest inside it. Non-cited rows keep the simpler all-in-one
              button markup. */}
          <button
            type="button"
            data-kb-row=""
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left transition-colors",
              "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
            )}
            onClick={() => ctx.onOpen(node.path!, null)}
            onKeyDown={rowKeyDown}
            onMouseEnter={(e) => ctx.peekShow(e.currentTarget, node)}
            onMouseLeave={ctx.peekHide}
            onFocus={(e) => ctx.peekShow(e.currentTarget, node)}
            onBlur={ctx.peekHide}
          >
            {label}
            {!isCited && (
              <>
                {dot}
                {typeBadge}
              </>
            )}
          </button>
          {isCited && (
            <span className="flex shrink-0 items-center gap-1.5 pr-1">
              <ChipButtons
                chips={node.chips}
                jumpToMessage={ctx.jumpToMessage}
                labelTemplate={ctx.citationJumpLabel}
              />
              {dot}
              {typeBadge}
            </span>
          )}
        </div>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} ctx={childCtx} />)}
      </>
    );
  }

  // section — the open-section button. Cited sections wrap it in a flex row
  // so the chip buttons render as siblings (never inside the button); the
  // cited tint and pulse move to the wrapper so the whole row stays
  // highlighted. Non-cited sections keep the simpler single-button markup.
  const sectionButton = (
    <button
      type="button"
      data-kb-row=""
      style={isCited ? undefined : { paddingLeft: depth * 14 }}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-1.5 rounded py-0.5 text-left transition-colors",
        isCited ? "flex-1 pl-2" : "px-2",
        "hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
        !isCited && isPulse && "kb-pulse",
      )}
      onClick={() => ctx.onOpen(node.path!, node.anchor ?? null)}
      onKeyDown={rowKeyDown}
      onMouseEnter={(e) => ctx.peekShow(e.currentTarget, node)}
      onMouseLeave={ctx.peekHide}
      onFocus={(e) => ctx.peekShow(e.currentTarget, node)}
      onBlur={ctx.peekHide}
    >
      {/* Non-cited sections carry the depth padding on the button, so the
          rails render here; cited sections render them on the wrapper. */}
      {!isCited && <GuideRails depth={depth} trailLevel={selfTrail} />}
      <span aria-hidden className="shrink-0 font-mono text-2xs text-[var(--color-text-tertiary)]">
        #
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-primary)]">
        {highlightMatch(node.label, ctx.needle)}
      </span>
    </button>
  );

  if (!isCited) return sectionButton;
  return (
    <div
      style={{ paddingLeft: depth * 14 }}
      className={cn(
        "relative flex items-center gap-1.5 rounded pr-2",
        "bg-[rgba(var(--color-accent-rgb),0.06)]",
        isPulse && "kb-pulse",
      )}
    >
      <GuideRails depth={depth} trailLevel={selfTrail} />
      {sectionButton}
      <ChipButtons
        chips={node.chips}
        jumpToMessage={ctx.jumpToMessage}
        labelTemplate={ctx.citationJumpLabel}
      />
    </div>
  );
}

export function KbTree({
  manifest,
  citedRefs,
  onOpen,
  filter = "",
  lens = false,
}: {
  manifest: KbFile[];
  citedRefs: CitedRef[];
  onOpen: (path: string, anchor?: string | null) => void;
  filter?: string;
  lens?: boolean;
}) {
  const { strings, lang, groups: configGroups, apiBasePath, seenAutoReveal, jumpToMessage } =
    useKb();
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

  const { isExpanded, toggle, pulseId } = useKbTreeState({
    storageKey: `queritae:kbTree:${apiBasePath}`,
    files,
    citedRefs,
    groupNames,
    seenAutoReveal,
  });

  const { active: peekActive, show: rawShow, hide: peekHide } = useKbPeek(apiBasePath, lang);
  const peekShow = useCallback(
    (el: HTMLElement, node: KbTreeNode) => {
      if (!node.path) return;
      const target: PeekTarget = node.kind === "section" && node.anchor
        ? { kind: "section", slug: node.anchor }
        : { kind: "doc" };
      const file = files.find((f) => f.path === node.path);
      if (file) rawShow(el, file, target);
    },
    [files, rawShow],
  );

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
    jumpToMessage,
    expandLabel: strings.expandGroup,
    collapseLabel: strings.collapseGroup,
    citationJumpLabel: strings.citationJump,
    needle: filter.trim().toLowerCase(),
    peekShow,
    peekHide,
  };

  const containerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
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
    <>
    <div ref={containerRef} className="flex flex-col gap-2" onKeyDown={containerKeyDown}>
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
              <span className="min-w-0 flex-1 truncate text-control text-[var(--color-text-secondary)]">
                {f.title}
              </span>
              {f.type !== "md" && <span className="sr-only">{f.type}</span>}
              <KbFileGlyph type={f.type} />
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
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.noMatches}</p>
        </div>
      ) : null}
    </div>
    <KbPeek active={peekActive} />
    </>
  );
}

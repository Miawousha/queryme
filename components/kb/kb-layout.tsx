"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useKb } from "@/components/kb/kb-context";
import { useDialog } from "@/lib/use-dialog";
import { useIsDesktop } from "@/lib/use-is-desktop";

/**
 * The pane keeps two widths: one for the tree alone, and a wider one while a
 * document is open beside the tree. Each is draggable and persisted on its own,
 * so opening a doc widens the pane and closing it restores the tree width.
 */
const MODES = {
  tree: { key: "queritae:kbPanelWidth", min: 24, max: 60, def: 38 },
  doc: { key: "queritae:kbPanelWidthDoc", min: 36, max: 80, def: 62 },
} as const;
type Mode = keyof typeof MODES;
const MODES_DEFAULTS: Record<Mode, number> = { tree: MODES.tree.def, doc: MODES.doc.def };

/**
 * Two-pane app-shell body: `chat` on the left, `panel` on the right. Fills the
 * viewport edge-to-edge — the KB pane is flush to the right screen edge.
 * Desktop (>= sm): a draggable divider sets the panel width (persisted); the
 * panel collapses to a flush rail. Mobile: single column, the panel is a
 * full-screen overlay toggled by the floating button.
 *
 * `collapsed` is optionally controlled: when `collapsed`/`onCollapsedChange`
 * are passed (by the app shell, so the top-bar KB button can drive it) they
 * win; otherwise the component keeps the state internally.
 */
export function KbLayout({
  chat,
  panel,
  collapsed: collapsedProp,
  onCollapsedChange,
}: {
  chat: ReactNode;
  panel: ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
}) {
  const { strings, onJumpToMessage, openTarget } = useKb();
  const isDesktop = useIsDesktop();
  const mode: Mode = openTarget !== null ? "doc" : "tree";
  const { key: WIDTH_KEY, min: MIN_PCT, max: MAX_PCT } = MODES[mode];
  const [widths, setWidths] = useState<Record<Mode, number>>(MODES_DEFAULTS);
  const widthPct = widths[mode];
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const setWidthPct = (pct: number) => setWidths((w) => ({ ...w, [mode]: pct }));
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragging = useRef(false);
  const drawerRef = useDialog<HTMLDivElement>(drawerOpen, () => setDrawerOpen(false));

  // Close the mobile drawer when the viewport grows past the breakpoint so the
  // drawer state doesn't linger invisibly and confuse the next narrow-viewport visit.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  // A tree-chip jump must be visible: on mobile the drawer covers the chat,
  // so close it when a chip requests a jump. No-op while already closed
  // (desktop included — React bails out on the unchanged state).
  useEffect(() => onJumpToMessage(() => setDrawerOpen(false)), [onJumpToMessage]);

  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    onCollapsedChange?.(next);
    if (collapsedProp === undefined) setCollapsedInternal(next);
  };

  useEffect(() => {
    const next = { ...MODES_DEFAULTS };
    for (const m of Object.keys(MODES) as Mode[]) {
      const stored = Number(localStorage.getItem(MODES[m].key));
      if (stored >= MODES[m].min && stored <= MODES[m].max) next[m] = stored;
    }
    setWidths(next);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const { min, max } = MODES[modeRef.current];
      const pct = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      const m = modeRef.current;
      setWidths((w) => ({ ...w, [m]: Math.min(max, Math.max(min, pct)) }));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      const m = modeRef.current;
      setWidths((w) => {
        localStorage.setItem(MODES[m].key, String(Math.round(w[m])));
        return w;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <>
      {/*
        `chat` is rendered EXACTLY ONCE — it owns a `useChat` instance, so a
        second mount would create a second conversation. `panel` is also mounted
        at most once: the desktop pane is JS-gated on isDesktop, and the mobile
        drawer is JS-gated on !isDesktop, so they are mutually exclusive.
        KB state that must survive the desktop↔mobile swap lives in KbContext
        or sessionStorage; per-pane component state (filter, lens) resets on
        each mount.
      */}
      <div className="flex min-h-0 flex-1">
        {/* Chat — single instance, in flow on every breakpoint. */}
        <div className="min-w-0 flex-1">{chat}</div>

        {/* Desktop KB pane (>= sm only). JS-gated so the panel is never
            mounted on mobile — CSS-only hiding left panel rendering twice
            (desktop pane + open drawer). isDesktop is false during SSR
            (server snapshot) to avoid the mobile flash-of-desktop-pane;
            desktop users see the pane appear on the first client render. */}
        {isDesktop && (collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label={strings.showPanel}
            className="flex w-9 shrink-0 items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-card)]/30 font-mono text-3xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ writingMode: "vertical-rl", letterSpacing: "0.14em" }}
          >
            KB
          </button>
        ) : (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={strings.resizePanel}
              aria-valuenow={Math.round(widthPct)}
              aria-valuemin={MIN_PCT}
              aria-valuemax={MAX_PCT}
              tabIndex={0}
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.userSelect = "none";
              }}
              onKeyDown={(e) => {
                const STEP = 3;
                let next: number | null = null;
                if (e.key === "ArrowLeft") next = Math.min(MAX_PCT, widthPct + STEP);
                else if (e.key === "ArrowRight") next = Math.max(MIN_PCT, widthPct - STEP);
                else if (e.key === "Home") next = MIN_PCT;
                else if (e.key === "End") next = MAX_PCT;
                if (next === null) return;
                e.preventDefault();
                setWidthPct(next);
                localStorage.setItem(WIDTH_KEY, String(Math.round(next)));
              }}
              className="w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] focus-visible:bg-[var(--color-accent)] focus-visible:outline-none"
            />
            <div
              className="flex shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-card)]/30"
              style={{ width: `${widthPct}%` }}
            >
              {panel}
            </div>
          </>
        ))}
      </div>

      {/* Mobile KB trigger (< sm only). JS-gated so it's absent from the
          DOM on desktop — symmetrical with the desktop pane above. */}
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-4 right-4 z-30 border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 font-mono text-2xs uppercase text-[var(--color-text-secondary)] shadow-lg"
          style={{ letterSpacing: "0.14em" }}
        >
          KB
        </button>
      )}
      {!isDesktop && drawerOpen && (
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={strings.panelLabel}
          tabIndex={-1}
          className="fixed inset-0 z-40 flex flex-col bg-[var(--color-background)] outline-none"
        >
          <div className="flex shrink-0 justify-end px-4 py-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={strings.closePanel}
              className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
              style={{ letterSpacing: "0.14em" }}
            >
              {strings.close} ›
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
        </div>
      )}
    </>
  );
}

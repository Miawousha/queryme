"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useKb } from "@/components/kb/kb-context";
import { useDialog } from "@/lib/use-dialog";
import { useIsDesktop } from "@/lib/use-is-desktop";

const WIDTH_KEY = "queritae:kbPanelWidth";
const MIN_PCT = 24;
const MAX_PCT = 60;
const DEFAULT_PCT = 38;

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
  const { strings, onJumpToMessage } = useKb();
  const isDesktop = useIsDesktop();
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
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
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (stored >= MIN_PCT && stored <= MAX_PCT) setWidthPct(stored);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pct = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      setWidthPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      setWidthPct((w) => {
        localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
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
            className="flex w-9 shrink-0 items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-card)]/30 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ writingMode: "vertical-rl", letterSpacing: "0.3em" }}
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
          className="fixed bottom-4 right-4 z-30 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 font-mono text-[10px] uppercase text-[var(--color-text-secondary)] shadow-lg"
          style={{ letterSpacing: "0.2em" }}
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
              className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
              style={{ letterSpacing: "0.2em" }}
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

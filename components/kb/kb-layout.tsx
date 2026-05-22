"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const WIDTH_KEY = "queryme:kbPanelWidth";
const MIN_PCT = 24;
const MAX_PCT = 60;
const DEFAULT_PCT = 38;

/**
 * Two-pane layout: `chat` on the left, `panel` on the right.
 * Desktop (>= sm): a draggable divider sets the panel width (persisted); the
 * panel collapses to a rail. Mobile: single column, the panel is a slide-over
 * drawer toggled by the floating button.
 */
export function KbLayout({ chat, panel }: { chat: ReactNode; panel: ReactNode }) {
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragging = useRef(false);

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
        second mount would create a second conversation. `panel` is stateless
        (it reads `KbContext`); rendering it in both the desktop pane and the
        mobile drawer is a harmless minor duplication.
      */}
      <div className="flex min-h-0 flex-1">
        {/* Chat — single instance, in flow on every breakpoint. */}
        <div className="min-w-0 flex-1">{chat}</div>

        {/* Desktop KB pane (>= sm only). */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Show the knowledge base panel"
            className="ml-2 hidden w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] sm:flex"
            style={{ writingMode: "vertical-rl", letterSpacing: "0.3em" }}
          >
            KB
          </button>
        ) : (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.userSelect = "none";
              }}
              className="mx-1 hidden w-1 shrink-0 cursor-col-resize rounded-full bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] sm:block"
            />
            <div
              className="hidden shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 sm:block"
              style={{ width: `${widthPct}%` }}
            >
              <div className="flex h-full flex-col">
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse the knowledge base panel"
                  className="mb-2 self-end font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
                  style={{ letterSpacing: "0.2em" }}
                >
                  collapse ›
                </button>
                <div className="min-h-0 flex-1">{panel}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile drawer trigger (< sm only). */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-30 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 font-mono text-[10px] uppercase text-[var(--color-text-secondary)] shadow-lg sm:hidden"
        style={{ letterSpacing: "0.2em" }}
      >
        KB
      </button>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/50 sm:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full w-[88%] max-w-sm overflow-auto border-l border-[var(--color-border)] bg-[var(--color-background)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close the knowledge base panel"
              className="mb-2 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
              style={{ letterSpacing: "0.2em" }}
            >
              close ›
            </button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Detail panel that slides in from the right edge of the viewport to show a
 * single record without leaving the list. Shared by every admin tab.
 *
 * Behavior:
 *   - Fixed overlay; rest of the page is dimmed by a backdrop.
 *   - Click the backdrop or press Escape to close.
 *   - Focus moves into the panel on open and is restored to the trigger on
 *     close, so keyboard navigation stays coherent.
 *   - Page scroll is locked while open so the underlying list doesn't move.
 *
 * The component is uncontrolled in style (no transition library) — the
 * `open` prop drives a transform; CSS handles the animation.
 */
export function DetailSidebar({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small uppercase label above the title (e.g. "Conversation"). */
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Capture the triggering element when the panel opens so we can hand focus
  // back when it closes (e.g. the row that was clicked in the list).
  useEffect(() => {
    if (!open) return;
    lastTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Move focus to the panel itself; the close button is the first
    // focusable inside it.
    panelRef.current?.focus();
    return () => {
      lastTriggerRef.current?.focus();
    };
  }, [open]);

  // Close on Escape — listener only attached while open so we don't intercept
  // Escape in the rest of the app.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open so background content doesn't drift.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-40",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Record detail"}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(640px,92vw)] flex-col",
          "border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl",
          "transition-transform duration-200 ease-out focus:outline-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow && (
              <span
                className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.18em" }}
              >
                {eyebrow}
              </span>
            )}
            <h2 className="truncate font-display text-[15px] font-medium text-[var(--color-text-primary)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className={cn(
              "shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1",
              "font-mono text-[10px] uppercase text-[var(--color-text-secondary)] transition-colors",
              "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
              "focus-visible:outline-none focus-visible:border-[var(--color-primary)]",
            )}
            style={{ letterSpacing: "0.18em" }}
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

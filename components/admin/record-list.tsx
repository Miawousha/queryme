"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical list of selectable records, shared by every admin tab. Each row is
 * a button whose visible content is supplied by the caller's `renderRow`; this
 * component owns the framing (card border, hover/selected affordance, focus
 * outline, click handling, row id for cross-tab scroll-into-view).
 *
 * Selection is controlled — the caller keeps the open record and reacts by
 * opening the detail sidebar.
 */
export function RecordList<T>({
  items,
  getId,
  selectedId,
  onSelect,
  renderRow,
  rowIdPrefix,
  empty,
  ariaLabel,
}: {
  items: T[];
  getId: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderRow: (item: T) => ReactNode;
  /** When set, each row gets `id={`${rowIdPrefix}-${id}`}` so callers can scrollIntoView. */
  rowIdPrefix?: string;
  empty?: ReactNode;
  ariaLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-tertiary)]">
        {empty ?? "Nothing to show."}
      </p>
    );
  }
  return (
    <ul
      aria-label={ariaLabel}
      className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] bg-[var(--color-void)]"
    >
      {items.map((item) => {
        const id = getId(item);
        const selected = id === selectedId;
        return (
          <li key={id}>
            <button
              type="button"
              id={rowIdPrefix ? `${rowIdPrefix}-${id}` : undefined}
              aria-pressed={selected}
              onClick={() => onSelect(id)}
              className={cn(
                "relative w-full px-4 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]/50",
                // The selected row carries v2's sidebar mark: a brand bar on the left.
                selected
                  ? "bg-[var(--color-card)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[var(--color-brand)]"
                  : "hover:bg-[var(--color-card)]/60",
              )}
            >
              {renderRow(item)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useKb } from "@/components/kb/kb-context";
import { extractExcerpt } from "@/lib/kb/peek-extract";
import { metaSubtitle } from "@/lib/kb/meta-format";
import type { PeekActive } from "@/lib/kb/use-kb-peek";

/** Floating preview card for a hovered/focused KB row. Positioned to the LEFT
 * of the panel (the panel hugs the right screen edge), clamped to the viewport.
 * Error state renders nothing (silent). */
export function KbPeek({ active }: { active: PeekActive | null }) {
  const { strings } = useKb();
  if (!active) return null;

  const { file, target, rect, state } = active;

  // Authored one-liner (experience `summary` / project `description`, folded
  // into meta.description by the manifest). Doc-level only — a section peek
  // wants that section's body, not the whole-doc summary. It comes from the
  // manifest, so it shows immediately (no body fetch) and survives a fetch error.
  const summary = target.kind === "doc" ? file.meta?.description?.trim() || null : null;

  // Without an authored summary, a failed body fetch leaves nothing to show.
  if (state.status === "error" && !summary) return null;

  const preview = summary ?? (state.status === "ready" ? extractExcerpt(state.text, target) : null);
  const subtitle = file.meta ? metaSubtitle(file.meta) : null;

  // Anchor the card to the left of the row, vertically aligned to it; clamp the
  // top so a near-bottom row's card stays on screen.
  const width = 300;
  const left = Math.max(8, rect.left - width - 8);
  const top = Math.min(rect.top, typeof window !== "undefined" ? window.innerHeight - 140 : rect.top);

  return (
    <div
      role="tooltip"
      style={{ position: "fixed", top, left, width }}
      className="z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg"
    >
      <p className="truncate text-control font-medium text-[var(--color-text-primary)]">{file.title}</p>
      {subtitle && (
        <p className="truncate text-2xs text-[var(--color-text-tertiary)]">{subtitle}</p>
      )}
      <div className="mt-1.5 border-t border-[var(--color-border)] pt-1.5">
        {preview !== null ? (
          <p className="line-clamp-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {preview}
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.peekLoading}</p>
        )}
      </div>
    </div>
  );
}

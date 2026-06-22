import type { KbFileType } from "@/lib/kb/file-type";
import { cn } from "@/lib/utils";

const PATHS: Record<Exclude<KbFileType, "md">, string> = {
  // simple line glyphs in a 24×24 box, stroked with currentColor
  yaml: "M4 7h16M4 12h10M4 17h7",
  html: "M8 6l-4 6 4 6M16 6l4 6-4 6",
  pdf: "M6 3h8l4 4v14H6zM14 3v4h4",
};

/** Muted type glyph for KB rows. Markdown (the dominant type) renders nothing
 * so the right edge stays quiet; other types get a small line glyph. */
export function KbFileGlyph({ type, className }: { type: KbFileType; className?: string }) {
  if (type === "md") return null;
  return (
    <svg
      data-kb-glyph={type}
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 text-[var(--color-text-tertiary)]", className)}
    >
      <path d={PATHS[type]} />
    </svg>
  );
}

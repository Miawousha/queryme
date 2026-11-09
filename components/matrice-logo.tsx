import { cn } from "@/lib/utils";

/**
 * Matrice's mark, as drawn on matrice-website-v2 (components/site/logo.tsx):
 * "Columns", a header row over two columns, read as a square lowercase m.
 */
const MARK_PATH = "M8 14H92V86H76V34H58V86H42V34H24V86H8Z";
const MARK_BOX = { x: 8, y: 14, w: 84, h: 72 };

type MatriceLogoProps = {
  /** Height of the mark in px. */
  size?: number;
  /** Kept for callers of the earlier animated grid mark; v2's mark is still. */
  animated?: boolean;
  className?: string;
};

/** The mark alone. The viewBox is cropped to the shape so it centers on what you see. */
export function MatriceLogo({ size = 21, className }: MatriceLogoProps) {
  return (
    <svg
      viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}`}
      height={size}
      width={(size * MARK_BOX.w) / MARK_BOX.h}
      aria-hidden
      className={cn("shrink-0 text-[var(--color-text-primary)]", className)}
    >
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}

/** The mark and a wordmark beside it, set like v2's MATRICE logotype. */
export function MatriceWordmark({
  word = "MATRICE",
  size = 21,
  className,
}: {
  word?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <MatriceLogo size={size} />
      <span className="font-heading text-[15px] font-bold uppercase leading-none tracking-[0.14em] text-[var(--color-text-primary)] [text-box:trim-both_cap_alphabetic]">
        {word}
      </span>
    </span>
  );
}

export type MarkLockup = "tile" | "glyph";

export interface QueritaeMarkOptions {
  /** "tile" = solid square with the Q knocked out; "glyph" = bare Q on transparent. */
  lockup?: MarkLockup;
  /** Any CSS color for the mark's single fill. Default ink #0f172a. */
  color?: string;
  /** Rendered width/height in px (viewBox stays 96). Default 96. */
  size?: number;
  /** DOM id for the knockout mask — make unique when inlining several. Default "q". */
  id?: string;
}

// Fixed 96-unit geometry — the only place glyph proportions are defined.
const RING = { cx: 48, cy: 44, r: 26, w: 11 };
const CURSOR = { x: 56, y: 53, w: 18, h: 18, rx: 4 };

/**
 * The Queritae mark as an SVG string. The "tile" lockup carves the Q + cursor
 * out of a solid square via a mask, so the whole mark is one recolorable fill
 * and the knockout is true transparency (renders correctly on any background).
 */
export function queritaeMarkSvg(opts: QueritaeMarkOptions = {}): string {
  const { lockup = "tile", color = "#0f172a", size = 96, id = "q" } = opts;
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 96 96" role="img" aria-label="Queritae">`;

  if (lockup === "glyph") {
    return (
      open +
      `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="${color}" stroke-width="${RING.w}"/>` +
      `<rect x="${CURSOR.x}" y="${CURSOR.y}" width="${CURSOR.w}" height="${CURSOR.h}" rx="${CURSOR.rx}" fill="${color}"/>` +
      `</svg>`
    );
  }

  return (
    open +
    `<mask id="${id}">` +
    `<rect width="96" height="96" fill="#fff"/>` +
    `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="#000" stroke-width="${RING.w}"/>` +
    `<rect x="${CURSOR.x}" y="${CURSOR.y}" width="${CURSOR.w}" height="${CURSOR.h}" rx="${CURSOR.rx}" fill="#000"/>` +
    `</mask>` +
    `<rect width="96" height="96" rx="22" fill="${color}" mask="url(#${id})"/>` +
    `</svg>`
  );
}

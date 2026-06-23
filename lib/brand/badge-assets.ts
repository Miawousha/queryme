import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";

export const BADGE_INK = "#0f172a";
export const BADGE_WHITE = "#ffffff";
export const BRAND_CYAN = "#22d3ee";

export interface SvgAsset { file: string; svg: string; }
export interface PngAsset { file: string; svg: string; width: number; }

/** SVG files written verbatim: the favicon (brand cyan, visible on any tab) and
 *  the downloadable vector badge (ink). */
export function svgAssets(): SvgAsset[] {
  return [
    { file: "app/icon.svg", svg: queritaeMarkSvg({ lockup: "tile", color: BRAND_CYAN, size: 32 }) },
    { file: "public/badge/queritae.svg", svg: queritaeMarkSvg({ lockup: "tile", color: BADGE_INK, size: 96 }) },
  ];
}

/** PNGs rasterized for email clients: ink + white, 1x (48px) and 2x (96px). */
export function pngAssets(): PngAsset[] {
  const out: PngAsset[] = [];
  for (const [name, color] of [["ink", BADGE_INK], ["white", BADGE_WHITE]] as const) {
    const svg = queritaeMarkSvg({ lockup: "tile", color, size: 96 });
    out.push({ file: `public/badge/queritae-${name}.png`, svg, width: 48 });
    out.push({ file: `public/badge/queritae-${name}@2x.png`, svg, width: 96 });
  }
  return out;
}

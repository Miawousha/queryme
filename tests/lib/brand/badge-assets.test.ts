import { describe, it, expect } from "vitest";
import { svgAssets, pngAssets } from "@/lib/brand/badge-assets";

describe("badge asset manifest", () => {
  it("emits the favicon and the vector badge as svg files", () => {
    const files = svgAssets().map((a) => a.file);
    expect(files).toContain("app/icon.svg");
    expect(files).toContain("public/badge/queritae.svg");
  });

  it("emits ink + white pngs at 1x and 2x", () => {
    const files = pngAssets().map((a) => a.file).sort();
    expect(files).toEqual([
      "public/badge/queritae-ink.png",
      "public/badge/queritae-ink@2x.png",
      "public/badge/queritae-white.png",
      "public/badge/queritae-white@2x.png",
    ]);
    const twoX = pngAssets().find((a) => a.file.endsWith("@2x.png"));
    expect(twoX?.width).toBe(96);
    const oneX = pngAssets().find((a) => a.file === "public/badge/queritae-ink.png");
    expect(oneX?.width).toBe(48);
  });
});

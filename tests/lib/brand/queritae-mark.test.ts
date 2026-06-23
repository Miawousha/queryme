import { describe, it, expect } from "vitest";
import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";

describe("queritaeMarkSvg", () => {
  it("returns a 96-viewBox svg sized to `size`", () => {
    const svg = queritaeMarkSvg({ size: 48 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 96 96"');
    expect(svg).toContain('width="48" height="48"');
  });

  it("tile lockup knocks the Q out of a solid fill via a mask", () => {
    const svg = queritaeMarkSvg({ lockup: "tile", color: "#0f172a" });
    expect(svg).toContain("<mask");
    expect(svg).toContain('rx="22"');
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('mask="url(#q)"');
  });

  it("glyph lockup strokes the ring in the chosen color and uses no mask", () => {
    const svg = queritaeMarkSvg({ lockup: "glyph", color: "#ffffff" });
    expect(svg).not.toContain("<mask");
    expect(svg).toContain('stroke="#ffffff"');
  });

  it("uses a custom mask id so several marks can inline without collisions", () => {
    const svg = queritaeMarkSvg({ id: "q-dark" });
    expect(svg).toContain('<mask id="q-dark">');
    expect(svg).toContain('mask="url(#q-dark)"');
  });
});

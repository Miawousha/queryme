/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KbFileGlyph } from "@/components/kb/kb-file-glyph";

describe("KbFileGlyph", () => {
  it("renders nothing for markdown (the quiet default)", () => {
    const { container } = render(<KbFileGlyph type="md" />);
    expect(container.firstChild).toBeNull();
  });

  it.each(["yaml", "html", "pdf"] as const)("renders an aria-hidden glyph for %s", (type) => {
    const { container } = render(<KbFileGlyph type={type} />);
    const glyph = container.querySelector(`[data-kb-glyph="${type}"]`);
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden");
  });
});

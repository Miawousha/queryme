import { describe, it, expect } from "vitest";
import { extractExcerpt } from "@/lib/kb/peek-extract";

const DOC = `---
title: ION
role: CTO
---
# ION Energy

Built battery analytics for fleets.

## Overview

Founding team, 0 to 1 product.

## Battery telemetry

Real-time pipelines at scale.
`;

describe("extractExcerpt", () => {
  it("doc: skips frontmatter + a leading H1, returns the intro body", () => {
    expect(extractExcerpt(DOC, { kind: "doc" })).toBe("Built battery analytics for fleets.");
  });

  it("section: returns text from the heading down to the next heading", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "overview" })).toBe(
      "Founding team, 0 to 1 product.",
    );
  });

  it("section: last section runs to end of file", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "battery-telemetry" })).toBe(
      "Real-time pipelines at scale.",
    );
  });

  it("section: unmatched slug falls back to the doc intro", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "nope" })).toBe(
      "Built battery analytics for fleets.",
    );
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = "Intro line.\n\n```\n## not a heading\n```\n";
    expect(extractExcerpt(md, { kind: "doc" })).toBe("Intro line.");
  });

  it("truncates to maxChars with an ellipsis", () => {
    const md = "x".repeat(50);
    expect(extractExcerpt(md, { kind: "doc" }, 10)).toBe("xxxxxxxxx…");
  });
});

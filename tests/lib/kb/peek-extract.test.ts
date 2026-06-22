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

  it("doc: falls back to the first section's body when there is no intro paragraph", () => {
    // KB experience/project docs carry no prose before the first heading — their
    // content starts at `## …`. The doc excerpt must surface that first section
    // rather than coming back empty (the peek "yields nothing" bug).
    const md = `---
company: ION Energy
role: Co-founder & CTO
---

## Context

ION Energy was founded in 2016 in Mumbai.

## Role

Built and led the org.
`;
    expect(extractExcerpt(md, { kind: "doc" })).toBe("ION Energy was founded in 2016 in Mumbai.");
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

  it("treats an empty-slug heading inside a section as body text, not a divider", () => {
    // `### ***` slugifies to "" so it is NOT a section (extractSections drops
    // it). scan() must mirror that: the line stays part of the body run rather
    // than terminating the excerpt at the first physical heading.
    const md = ["## Notes", "Alpha line.", "### ***", "Beta line.", "## End", "x"].join("\n");
    const out = extractExcerpt(md, { kind: "section", slug: "notes" });
    expect(out).toContain("Beta line.");
  });

  it("an empty-slug heading before a duplicate heading doesn't shift the -n suffix", () => {
    const md = [
      "# Doc",
      "",
      "Intro.",
      "",
      "## !!!", // slugifies to "" → not a real section, and not counted
      "",
      "Stray text.",
      "",
      "## Repeat",
      "",
      "First repeat.",
      "",
      "## Repeat",
      "",
      "Second repeat.",
      "",
    ].join("\n");
    expect(extractExcerpt(md, { kind: "section", slug: "repeat" })).toBe("First repeat.");
    expect(extractExcerpt(md, { kind: "section", slug: "repeat-1" })).toBe("Second repeat.");
  });

  it("handles CRLF line endings for doc and section excerpts", () => {
    const md = "# Title\r\n\r\nIntro paragraph.\r\n\r\n## Overview\r\n\r\nOverview body.\r\n";
    expect(extractExcerpt(md, { kind: "doc" })).toBe("Intro paragraph.");
    expect(extractExcerpt(md, { kind: "section", slug: "overview" })).toBe("Overview body.");
  });
});

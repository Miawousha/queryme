import { describe, it, expect } from "vitest";
import { extractSections } from "@/lib/kb/sections";

describe("extractSections", () => {
  it("extracts h2 and h3 headings with levels, ignoring h1 and h4", () => {
    const body = "# Title\n\n## Overview\n\ntext\n\n### Detail\n\n#### Deep\n";
    expect(extractSections(body)).toEqual([
      { slug: "overview", title: "Overview", level: 2 },
      { slug: "detail", title: "Detail", level: 3 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const body = "## Real\n\n```md\n## Fake\n```\n\n~~~\n## Also fake\n~~~\n\n## After\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["real", "after"]);
  });

  it("suffixes duplicate slugs like GitHub (-1, -2)", () => {
    const body = "## Setup\n\n## Setup\n\n## Setup\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["setup", "setup-1", "setup-2"]);
  });

  it("strips trailing closing hashes from titles", () => {
    const body = "## Closed heading ##\n";
    expect(extractSections(body)).toEqual([
      { slug: "closed-heading", title: "Closed heading", level: 2 },
    ]);
  });

  it("skips headings that slugify to nothing", () => {
    const body = "## !!!\n## Ok\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["ok"]);
  });

  it("returns [] for a body with no h2/h3", () => {
    expect(extractSections("just text\n")).toEqual([]);
  });
});

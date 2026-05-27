import { describe, it, expect } from "vitest";
import {
  slugifyRepoName,
  extractReadmeParagraph,
  buildPublicFrontmatter,
  buildPrivateFrontmatter,
  type GhRepo,
} from "@/scripts/lib/github-repos";

describe("slugifyRepoName", () => {
  it("lowercases and replaces non-alphanumerics with hyphens", () => {
    expect(slugifyRepoName("Foo.Bar_Baz")).toBe("foo-bar-baz");
  });
  it("collapses runs of separators", () => {
    expect(slugifyRepoName("a---b__c")).toBe("a-b-c");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugifyRepoName("-x-")).toBe("x");
  });
});

describe("extractReadmeParagraph", () => {
  it("returns the first non-heading paragraph", () => {
    const md = "# Title\n\nSome intro text.\n\nMore text.";
    expect(extractReadmeParagraph(md)).toBe("Some intro text.");
  });
  it("skips badge-only paragraphs", () => {
    const md = "# Title\n\n![badge](https://img.shields.io/x)\n\nReal intro.";
    expect(extractReadmeParagraph(md)).toBe("Real intro.");
  });
  it("strips inline badges from the paragraph it returns", () => {
    const md = "![badge](https://img.shields.io/x) Real intro continues here.";
    expect(extractReadmeParagraph(md)).toBe("Real intro continues here.");
  });
  it("returns null when there is no usable paragraph", () => {
    expect(extractReadmeParagraph("# Title only\n\n## More headings")).toBeNull();
    expect(extractReadmeParagraph("")).toBeNull();
  });
  it("strips raw HTML tags", () => {
    const md = "<p align=\"center\">Centered intro</p>";
    expect(extractReadmeParagraph(md)).toBe("Centered intro");
  });
});

const baseRepo: GhRepo = {
  name: "ExampleRepo",
  description: "An example.",
  url: "https://github.com/Miawousha/ExampleRepo",
  isPrivate: false,
  isArchived: false,
  isFork: false,
  primaryLanguage: { name: "TypeScript" },
  stargazerCount: 12,
  repositoryTopics: [{ name: "cli" }, { name: "tooling" }],
  createdAt: "2024-03-15T10:00:00Z",
  pushedAt: "2025-06-01T10:00:00Z",
};

describe("buildPublicFrontmatter", () => {
  it("maps gh fields to KB frontmatter", () => {
    const fm = buildPublicFrontmatter(baseRepo, "author");
    expect(fm).toEqual({
      name: "ExampleRepo",
      url: "https://github.com/Miawousha/ExampleRepo",
      role: "author",
      visibility: "public",
      description: "An example.",
      year: 2024,
      language: "TypeScript",
      stars: 12,
      archived: false,
      tags: ["cli", "tooling"],
    });
  });
  it("omits empty/undefined fields cleanly", () => {
    const fm = buildPublicFrontmatter(
      { ...baseRepo, description: null, primaryLanguage: null, stargazerCount: 0, repositoryTopics: [] },
      "contributor",
    );
    expect(fm.description).toBeUndefined();
    expect(fm.language).toBeUndefined();
    expect(fm.tags).toBeUndefined();
    expect(fm.stars).toBe(0);
  });
});

describe("buildPrivateFrontmatter", () => {
  it("omits url and sets visibility=private", () => {
    const fm = buildPrivateFrontmatter({ ...baseRepo, isPrivate: true });
    expect(fm.visibility).toBe("private");
    expect(fm.url).toBeUndefined();
    expect(fm.role).toBe("author");
  });
});

describe("frontmatter builders — null repositoryTopics", () => {
  it("buildPublicFrontmatter handles null topics from gh", () => {
    const repo = { ...baseRepo, repositoryTopics: null as unknown as { name: string }[] };
    const fm = buildPublicFrontmatter(repo, "author");
    expect(fm.tags).toBeUndefined();
  });
  it("buildPrivateFrontmatter handles null topics from gh", () => {
    const repo = { ...baseRepo, isPrivate: true, repositoryTopics: null as unknown as { name: string }[] };
    const fm = buildPrivateFrontmatter(repo);
    expect(fm.tags).toBeUndefined();
  });
});

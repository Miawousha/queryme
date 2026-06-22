import { describe, it, expect } from "vitest";
import { assembleCvMarkdown, cvFileSlug, cvDownloadFilename } from "@/lib/cv/markdown";
import { makeKb } from "../../helpers/cv-fixtures";

describe("assembleCvMarkdown", () => {
  it("renders the profile header and section headings", () => {
    const md = assembleCvMarkdown(makeKb(), "en");
    expect(md).toContain("# Ada Lovelace");
    expect(md).toContain("Computing pioneer");
    expect(md).toContain("## Experience");
    expect(md).toContain("### Mathematician · Analytical Engine Project");
    expect(md).toContain("## Education");
    expect(md).toContain("## Skills");
    expect(md).toContain("## Projects");
    expect(md).toContain("## Publications");
    expect(md).toContain("- **Notes on the Analytical Engine** — A. Lovelace · Taylor's Scientific Memoirs · 1843");
  });

  it("renders one rich line per project — name(link), description, year — and no separate Open source block", () => {
    const md = assembleCvMarkdown(makeKb(), "en");
    expect(md).toContain(
      "- **Note G** (https://example.com/note-g) — The first published algorithm intended for a machine., 1843",
    );
    // The two legacy blocks are merged into one "Projects" section.
    expect(md).not.toContain("## Open source");
    expect(md).not.toContain("## Selected projects");
  });

  it("links a project via its first public repo when it has no frontmatter url, and never leaks a private repo url", () => {
    const kb = makeKb({
      projects: [
        {
          slug: "altergo",
          relativePath: "projects/altergo.md",
          frontmatter: {
            name: "Altergo",
            description: "Battery intelligence platform.",
            repos: [
              { name: "core", role: "author", visibility: "private", url: "https://github.com/x/private-core" },
              { name: "sdk", role: "author", visibility: "public", url: "https://github.com/x/public-sdk" },
            ],
          },
          body: "",
        },
      ],
    });
    const md = assembleCvMarkdown(kb, "en");
    expect(md).toContain("- **Altergo** (https://github.com/x/public-sdk) — Battery intelligence platform.");
    expect(md).not.toContain("private-core");
  });

  it("includes the bio and a Selected achievements section when the profile has them", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        bio: "Mathematician who wrote the first published algorithm.",
        achievements: ["**First algorithm** intended for a machine."],
      },
    });
    const md = assembleCvMarkdown(kb, "en");
    expect(md).toContain("Mathematician who wrote the first published algorithm.");
    expect(md).toContain("## Selected achievements");
    expect(md).toContain("- **First algorithm** intended for a machine.");

    const fr = assembleCvMarkdown(kb, "fr");
    expect(fr).toContain("## Réalisations clés");
  });

  it("omits the bio and achievements section when the profile lacks them", () => {
    const md = assembleCvMarkdown(makeKb(), "en");
    expect(md).not.toContain("## Selected achievements");
  });

  it("uses curated highlights when present, body bullets otherwise", () => {
    const withHighlights = assembleCvMarkdown(makeKb(), "en");
    expect(withHighlights).toContain("- Wrote the first algorithm intended for a machine.");

    const kb = makeKb();
    kb.experience[0].frontmatter.highlights = undefined;
    const withBody = assembleCvMarkdown(kb, "en");
    expect(withBody).toContain("- Body bullet one");
  });

  it("localizes section headings for fr", () => {
    const md = assembleCvMarkdown(makeKb(), "fr");
    expect(md).toContain("## Expérience");
    expect(md).toContain("## Formation");
    expect(md).toContain("## Compétences");
    expect(md).toContain("## Projets");
  });
});

describe("cvFileSlug", () => {
  it("slugifies a name, stripping accents and punctuation", () => {
    expect(cvFileSlug("Ada Lovelace")).toBe("ada-lovelace");
    expect(cvFileSlug("Émile Zöla!")).toBe("emile-zola");
  });
  it("falls back to 'cv' for an empty result", () => {
    expect(cvFileSlug("!!!")).toBe("cv");
  });
});

describe("cvDownloadFilename", () => {
  it("appends .fr only for the French locale", () => {
    expect(cvDownloadFilename("Ada Lovelace", "en")).toBe("ada-lovelace-cv.md");
    expect(cvDownloadFilename("Ada Lovelace", "fr")).toBe("ada-lovelace-cv.fr.md");
  });
});

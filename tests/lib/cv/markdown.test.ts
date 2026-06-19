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
    expect(md).toContain("## Open source");
    expect(md).toContain("note-g");
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

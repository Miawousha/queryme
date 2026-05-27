import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("assemblePublicKbText", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("includes a top-level profile section with name and headline", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Profile");
    expect(text).toContain("Test Person");
    expect(text).toContain("Test headline");
  });

  it("includes skills with level and years", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Skills");
    expect(text).toContain("TypeScript");
    expect(text).toMatch(/TypeScript[^\n]*level: 5[^\n]*years: 10/);
  });

  it("includes one section per experience entry with file ref", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Experience");
    expect(text).toContain("## Fixture Co — Engineer (2024-01 → present)");
    expect(text).toContain("[ref: experience/2024-fixture-co.md]");
    expect(text).toContain("Fixture body.");
  });

  it("includes one section per project entry with file ref", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Projects");
    expect(text).toContain("## Fixture Project (2025)");
    expect(text).toContain("[ref: projects/fixture-project.md]");
  });

  it("includes education and public contact sections", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Education");
    expect(text).toContain("Test University");
    expect(text).toContain("# Public contact");
    expect(text).toContain("test@example.com");
  });

  it("includes a file ref for every YAML-sourced section so claims are citable", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("[ref: profile.yaml]");
    expect(text).toContain("[ref: skills.yaml]");
    expect(text).toContain("[ref: education.yaml]");
    expect(text).toContain("[ref: public-contact.yaml]");
  });

  it("is deterministic — same input produces same output", () => {
    expect(assemblePublicKbText(kb)).toBe(assemblePublicKbText(kb));
  });

  it("includes a Talks section with [ref: talks/...] markers when talks exist", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Talks");
    expect(text).toContain("[ref: talks/2024-evs37.md]");
    expect(text).toContain("Battery emulation at scale");
    expect(text).toContain("EVS37");
  });

  it("includes a Code section with [ref: code/...] markers", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Code");
    expect(text).toContain("[ref: code/queryme.md]");
    expect(text).toContain("queryme");
  });

  it("includes a Recommendations section with [ref: recommendations/...] markers", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Recommendations");
    expect(text).toContain("[ref: recommendations/2024-09-jane-doe.md]");
    expect(text).toContain("Jane Doe");
  });
});

describe("assemblePublicKbText — code featured/indexed split", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("with no featured list, renders one `# Code` section with all bodies (back-compat)", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Code");
    expect(text).not.toContain("# Code (featured)");
    expect(text).not.toContain("# Code (index)");
    // Both bodies present.
    expect(text).toContain("Project body — what it is and contributors.");
    expect(text).toContain("Sample indexed body");
  });

  it("with a featured list, renders featured entries fully and indexed entries as stubs", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme"] });
    expect(text).toContain("# Code (featured)");
    expect(text).toContain("## queryme");
    expect(text).toContain("Project body — what it is and contributors.");
    expect(text).toContain("# Code (index)");
    // Stub for the indexed entry.
    expect(text).toMatch(/^- sample-indexed — A fixture used to test/m);
    expect(text).toContain("tags: [ai, software]");
    expect(text).toContain("language: TypeScript");
    expect(text).toContain("year: 2024");
    expect(text).toContain("[ref: code/sample-indexed.md]");
    // Indexed body must NOT be in the prompt.
    expect(text).not.toContain("Sample indexed body");
  });

  it("appends a usage hint after the index section telling the agent to call lookup_code_entries", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme"] });
    expect(text).toContain("lookup_code_entries");
  });

  it("unknown featured slugs are silently skipped (no throw)", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["does-not-exist", "queryme"] });
    expect(text).toContain("## queryme");
    expect(text).toContain("# Code (index)");
  });

  it("when every code entry is featured, no index section is emitted", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme", "sample-indexed"] });
    expect(text).toContain("# Code (featured)");
    expect(text).not.toContain("# Code (index)");
  });

  it("when featured list is empty, falls back to single `# Code` section (back-compat)", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: [] });
    // Empty array means "no featured" — assembler should fall back to today's
    // behaviour (single `# Code` section with full bodies). This matches
    // getFeaturedCodeSlugs returning null for an empty list.
    expect(text).toContain("# Code");
    expect(text).not.toContain("# Code (index)");
  });
});

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

  it("includes one section per project entry with file ref and its repos", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Projects");
    expect(text).toContain("## Fixture Project (2025)");
    expect(text).toContain("[ref: projects/fixture-project.md]");
    expect(text).toContain("Description: A fixture project used across CV render tests.");
    expect(text).toContain("### Repositories");
    expect(text).toContain("- queryme — An agent-driven CV.");
    expect(text).toContain("- sample-indexed");
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

  it("no longer emits a top-level Code section", () => {
    const text = assemblePublicKbText(kb);
    expect(text).not.toContain("# Code");
    expect(text).not.toContain("[ref: code/");
  });

  it("includes a Recommendations section with [ref: recommendations/...] markers", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Recommendations");
    expect(text).toContain("[ref: recommendations/2024-09-jane-doe.md]");
    expect(text).toContain("Jane Doe");
  });
});

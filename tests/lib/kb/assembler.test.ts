import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { assembleKbText, assembleSensitiveKbText } from "@/lib/kb/assembler";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("assembleKbText", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("includes a top-level profile section with name and headline", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Profile");
    expect(text).toContain("Test Person");
    expect(text).toContain("Test headline");
  });

  it("includes skills with level and years", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Skills");
    expect(text).toContain("TypeScript");
    expect(text).toMatch(/TypeScript[^\n]*level: 5[^\n]*years: 10/);
  });

  it("includes one section per experience entry with file ref", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Experience");
    expect(text).toContain("## Fixture Co — Engineer (2024-01 → present)");
    expect(text).toContain("[ref: experience/2024-fixture-co.md]");
    expect(text).toContain("Fixture body.");
  });

  it("includes one section per project entry with file ref", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Projects");
    expect(text).toContain("## Fixture Project (2025)");
    expect(text).toContain("[ref: projects/fixture-project.md]");
  });

  it("includes education and public contact sections", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Education");
    expect(text).toContain("Test University");
    expect(text).toContain("# Public contact");
    expect(text).toContain("test@example.com");
  });

  it("includes a file ref for every YAML-sourced section so claims are citable", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("[ref: profile.yaml]");
    expect(text).toContain("[ref: skills.yaml]");
    expect(text).toContain("[ref: education.yaml]");
    expect(text).toContain("[ref: public-contact.yaml]");
  });

  it("is deterministic — same input produces same output", () => {
    expect(assembleKbText(kb)).toBe(assembleKbText(kb));
  });
});

describe("assembleSensitiveKbText", () => {
  let kb: Kb;
  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("includes salary, references, private contact sections with refs", () => {
    const text = assembleSensitiveKbText(kb.sensitive);
    expect(text).toContain("# Sensitive — Salary");
    expect(text).toContain("€90k–€110k");
    expect(text).toContain("[ref: sensitive/salary.yaml.enc]");
    expect(text).toContain("# Sensitive — References");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("[ref: sensitive/references.yaml.enc]");
    expect(text).toContain("# Sensitive — Private contact");
    expect(text).toContain("+33 6 00 00 00 00");
    expect(text).toContain("[ref: sensitive/private-contact.yaml.enc]");
  });

  it("returns empty string when every section is null", () => {
    expect(assembleSensitiveKbText({ salary: null, references: null, privateContact: null })).toBe("");
  });
});

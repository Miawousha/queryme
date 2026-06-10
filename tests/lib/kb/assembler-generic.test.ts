import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadContent, loadKb } from "@/lib/kb/loader";
import { assembleContentText, assemblePublicKbText } from "@/lib/kb/assembler";

const CUSTOM_ROOT = path.join(__dirname, "../../fixtures/content-custom");
const PERSONA_ROOT = path.join(__dirname, "../../fixtures/persona");

describe("assembleContentText", () => {
  it("is byte-identical to the legacy assembler for a no-config repo", async () => {
    const content = await loadContent(PERSONA_ROOT);
    const kb = await loadKb(path.join(PERSONA_ROOT, "kb"));
    expect(assembleContentText(content)).toBe(assemblePublicKbText(kb));
  });

  it("renders generic markdown collections with [ref:] markers", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text).toContain("# Notes");
    expect(text).toContain("## Second note");
    expect(text).toContain("[ref: notes/2026-01-first-note.md]");
    expect(text).toContain("tags: alpha, beta");
    expect(text).toContain("The first note's body.");
  });

  it("renders generic yaml collections verbatim with a [ref:] marker", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text).toContain("# Glossary");
    expect(text).toContain("[ref: glossary.yaml]");
    expect(text).toContain("definition: A widget with opinions.");
  });

  it("orders sections by config order", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text.indexOf("# Profile")).toBeLessThan(text.indexOf("# Notes"));
    expect(text.indexOf("# Notes")).toBeLessThan(text.indexOf("# Glossary"));
  });
});

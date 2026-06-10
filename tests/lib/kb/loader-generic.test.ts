import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadContent, loadKb, toResumeKb } from "@/lib/kb/loader";

const CUSTOM_ROOT = path.join(__dirname, "../../fixtures/content-custom");
const PERSONA_ROOT = path.join(__dirname, "../../fixtures/persona");

describe("loadContent (custom config)", () => {
  it("loads config-declared collections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    expect([...content.collections.keys()].sort()).toEqual(
      ["glossary", "notes", "profile", "public-contact"],
    );
  });

  it("sorts a generic markdown collection by the configured field", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const notes = content.collections.get("notes")!;
    if (notes.kind !== "markdown") throw new Error("expected markdown collection");
    expect(notes.entries.map((e) => e.slug)).toEqual([
      "2026-03-second-note",
      "2026-01-first-note",
    ]);
  });

  it("keeps raw text for generic yaml collections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const glossary = content.collections.get("glossary")!;
    if (glossary.kind !== "yaml") throw new Error("expected yaml collection");
    expect(glossary.raw).toContain("term: widget");
    expect(glossary.relativePath).toBe("glossary.yaml");
  });

  it("projects to a resume Kb with empty defaults for absent sections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const kb = toResumeKb(content);
    expect(kb.profile.name).toBe("Custom Subject");
    expect(kb.publicContact.email).toBe("corpus@example.com");
    expect(kb.skills.skills).toEqual([]);
    expect(kb.education.entries).toEqual([]);
    expect(kb.experience).toEqual([]);
  });
});

describe("loadContent (no config → resume preset)", () => {
  it("matches loadKb output for the persona fixture", async () => {
    const content = await loadContent(PERSONA_ROOT);
    const viaEngine = toResumeKb(content);
    const viaLegacy = await loadKb(path.join(PERSONA_ROOT, "kb"));
    expect(viaEngine).toEqual(viaLegacy);
  });
});

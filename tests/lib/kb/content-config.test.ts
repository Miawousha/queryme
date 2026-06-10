import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  loadContentConfig,
  resolveContentConfig,
  RESUME_PRESET,
  kbGroups,
} from "@/lib/kb/content-config";

function writeConfig(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "content-config-"));
  writeFileSync(path.join(dir, "content.config.yaml"), yaml);
  return dir;
}

const CORE = `
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
`;

describe("loadContentConfig", () => {
  it("returns null when content.config.yaml is absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "content-config-"));
    expect(loadContentConfig(dir)).toBeNull();
  });

  it("parses a valid config", () => {
    const dir = writeConfig(`
locales: [en]
collections:
${CORE}
  - name: notes
    kind: markdown
    label: { en: Notes }
    sort: { field: date, order: desc }
`);
    const config = loadContentConfig(dir);
    expect(config).not.toBeNull();
    expect(config!.locales).toEqual(["en"]);
    expect(config!.collections).toHaveLength(3);
  });

  it("throws a clear error on invalid YAML", () => {
    const dir = writeConfig("collections: [unclosed");
    expect(() => loadContentConfig(dir)).toThrow(/content\.config\.yaml/);
  });

  it("rejects required: true on a markdown collection", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
    required: true
`);
    expect(() => loadContentConfig(dir)).toThrow(/required/);
  });

  it("throws (not null) when content.config.yaml exists but is unreadable", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "content-config-"));
    mkdirSync(path.join(dir, "content.config.yaml"));
    expect(() => loadContentConfig(dir)).toThrow(/content\.config\.yaml/);
  });

  it("rejects collection names that are not kebab-case (path-segment safety)", () => {
    for (const bad of ["../evil", "a/b", "..", "UPPER", "with space", "café"]) {
      const dir = writeConfig(`
collections:
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: "${bad}"
    kind: markdown
`);
      expect(() => loadContentConfig(dir), bad).toThrow();
    }
  });

  it("rejects locales: [fr, en] — first locale must be en", () => {
    const dir = writeConfig(`
locales: [fr, en]
collections:
${CORE}
`);
    expect(() => loadContentConfig(dir)).toThrow(/first locale must be/);
  });

  it("rejects locales: [en, en] — locales must be unique", () => {
    const dir = writeConfig(`
locales: [en, en]
collections:
${CORE}
`);
    expect(() => loadContentConfig(dir)).toThrow(/locales must be unique/);
  });

  it("accepts locales: [en, fr]", () => {
    const dir = writeConfig(`
locales: [en, fr]
collections:
${CORE}
`);
    const config = loadContentConfig(dir);
    expect(config!.locales).toEqual(["en", "fr"]);
  });

  it("accepts locales: [en] (single-locale)", () => {
    const dir = writeConfig(`
locales: [en]
collections:
${CORE}
`);
    const config = loadContentConfig(dir);
    expect(config!.locales).toEqual(["en"]);
  });
});

describe("resolveContentConfig", () => {
  it("returns the resume preset for a null config", () => {
    expect(resolveContentConfig(null)).toBe(RESUME_PRESET);
  });

  it("defaults locales to [en, fr] and schema to generic", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
`);
    const resolved = resolveContentConfig(loadContentConfig(dir));
    expect(resolved.locales).toEqual(["en", "fr"]);
    const notes = resolved.collections.find((c) => c.name === "notes")!;
    expect(notes.schemaKey).toBe("generic");
  });

  it("applies the preset default sort when a preset schema is reused", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: gigs
    kind: markdown
    schema: experience
`);
    const resolved = resolveContentConfig(loadContentConfig(dir));
    const gigs = resolved.collections.find((c) => c.name === "gigs")!;
    expect(gigs.sort).toEqual({ field: "start", order: "desc" });
  });

  it("rejects a config without the profile collection", () => {
    const dir = writeConfig(`
collections:
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: notes
    kind: markdown
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/profile/);
  });

  it("rejects a yaml collection with a markdown-only schema", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: jobs
    kind: yaml
    schema: experience
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/schema/);
  });

  it("rejects duplicate collection names", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
  - name: notes
    kind: markdown
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/duplicate/);
  });

  // Fix 4: profile and public-contact must always be required:true in the resolved
  // config, regardless of what the raw YAML declared.  The Task-5 sync gate and
  // the app shell both depend on this guarantee.
  it("forces required:true on profile and public-contact regardless of config declaration", () => {
    // Declare both WITHOUT required: true (the schema default is false).
    const dir = writeConfig(`
collections:
  - name: profile
    kind: yaml
    schema: profile
  - name: public-contact
    kind: yaml
    schema: public-contact
`);
    const resolved = resolveContentConfig(loadContentConfig(dir));
    const prof = resolved.collections.find((c) => c.name === "profile")!;
    const pc = resolved.collections.find((c) => c.name === "public-contact")!;
    expect(prof.required).toBe(true);
    expect(pc.required).toBe(true);
  });
});

describe("RESUME_PRESET", () => {
  it("declares the 8 legacy collections in assembly order", () => {
    expect(RESUME_PRESET.collections.map((c) => c.name)).toEqual([
      "profile", "skills", "education", "public-contact",
      "experience", "projects", "talks", "recommendations",
    ]);
    expect(RESUME_PRESET.locales).toEqual(["en", "fr"]);
  });

  it("resume preset is deeply frozen", () => {
    expect(Object.isFrozen(RESUME_PRESET)).toBe(true);
    expect(Object.isFrozen(RESUME_PRESET.collections)).toBe(true);
    expect(Object.isFrozen(RESUME_PRESET.collections[0])).toBe(true);
    expect(() => (RESUME_PRESET.collections as unknown as unknown[]).reverse()).toThrow();
  });
});

describe("kbGroups", () => {
  it("returns markdown collections in order, with labels when configured", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
    label: { en: Notes, fr: Notes }
  - name: glossary
    kind: yaml
`);
    const groups = kbGroups(resolveContentConfig(loadContentConfig(dir)));
    expect(groups).toEqual([{ name: "notes", label: { en: "Notes", fr: "Notes" } }]);
  });

  it("matches the legacy GROUP_ORDER for the resume preset", () => {
    expect(kbGroups(RESUME_PRESET).map((g) => g.name)).toEqual([
      "experience", "projects", "talks", "recommendations",
    ]);
  });
});

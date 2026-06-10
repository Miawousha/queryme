import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadContent, loadKb } from "@/lib/kb/loader";
import type { LoadedContent, LoadedCollection, KbLang } from "@/lib/kb/loader";
import { assembleContentText, assemblePublicKbText } from "@/lib/kb/assembler";
import type { ResolvedCollection, ResolvedContentConfig } from "@/lib/kb/content-config";

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

// ─── Inline helpers for the unit tests below ──────────────────────────────────

function makeContent(
  collections: LoadedCollection[],
  lang: KbLang = "en",
): LoadedContent {
  const config: ResolvedContentConfig = {
    locales: ["en"],
    collections: collections.map((c) => c.config),
  };
  return {
    config,
    lang,
    collections: new Map(collections.map((c) => [c.config.name, c])),
  };
}

// ─── Fix 1 + 2 + 5: scalarOrList robustness ───────────────────────────────────

describe("scalarOrList robustness (via generic markdown rendering)", () => {
  it("handles Date → ISO, boolean, number, empty array → dropped, mixed array → filtered, block scalar → single line", () => {
    const col: ResolvedCollection = {
      name: "items",
      kind: "markdown",
      schemaKey: "generic",
      required: false,
    };
    const content = makeContent([
      {
        kind: "markdown",
        config: col,
        entries: [
          {
            slug: "item-1",
            relativePath: "items/item-1.md",
            frontmatter: {
              flag: true,
              count: 3,
              when: new Date("2026-01-04"),
              tags: [],
              mixed: ["", "a"],
              note: "line1\nline2",
            },
            body: "",
          },
        ],
      },
    ]);
    const text = assembleContentText(content);
    expect(text).toContain("flag: true");
    expect(text).toContain("count: 3");
    expect(text).toContain("when: 2026-01-04");
    expect(text).toContain("note: line1 line2");
    // empty array must not produce a line at all
    expect(text).not.toMatch(/\btags:/);
    // empty-string element filtered; "a" survives
    expect(text).toContain("mixed: a");
  });
});

// ─── Fix 2: empty collection → no heading ─────────────────────────────────────

describe("empty generic markdown collection", () => {
  it("emits no heading when there are no entries", () => {
    const col: ResolvedCollection = {
      name: "items",
      kind: "markdown",
      schemaKey: "generic",
      required: false,
    };
    const content = makeContent([{ kind: "markdown", config: col, entries: [] }]);
    const text = assembleContentText(content);
    expect(text).not.toContain("# Items");
    expect(text).toBe("");
  });
});

// ─── Fix 3: label localisation (fr fallback) ──────────────────────────────────

describe("fr label fallback", () => {
  it("uses fr label when lang is fr and fr is declared", () => {
    const col: ResolvedCollection = {
      name: "notes",
      kind: "markdown",
      schemaKey: "generic",
      required: false,
      label: { en: "Notes", fr: "Notas" },
    };
    const content = makeContent(
      [
        {
          kind: "markdown",
          config: col,
          entries: [{ slug: "x", relativePath: "notes/x.md", frontmatter: {}, body: "body" }],
        },
      ],
      "fr",
    );
    expect(assembleContentText(content)).toContain("# Notas");
  });

  it("falls back to en label when lang is fr but no fr label declared", () => {
    const col: ResolvedCollection = {
      name: "docs",
      kind: "markdown",
      schemaKey: "generic",
      required: false,
      label: { en: "Notes" },
    };
    const content = makeContent(
      [
        {
          kind: "markdown",
          config: col,
          entries: [{ slug: "x", relativePath: "docs/x.md", frontmatter: {}, body: "body" }],
        },
      ],
      "fr",
    );
    expect(assembleContentText(content)).toContain("# Notes");
  });
});

// ─── Fix 3: renamed preset — heading + ref use collection name, not schema key ─

describe("renamed preset collection", () => {
  it("emits collection-derived heading and relativePath, not schema key literals", () => {
    const col: ResolvedCollection = {
      name: "competences",
      kind: "yaml",
      schemaKey: "skills",
      required: false,
    };
    const content = makeContent([
      {
        kind: "yaml",
        config: col,
        relativePath: "competences.yaml",
        data: { skills: [{ name: "X", level: 3, years: 1 }] },
        raw: "skills:\n  - name: X\n    level: 3\n    years: 1\n",
      },
    ]);
    const text = assembleContentText(content);
    expect(text).toContain("# Competences");
    expect(text).toContain("[ref: competences.yaml]");
    expect(text).not.toContain("[ref: skills.yaml]");
  });
});

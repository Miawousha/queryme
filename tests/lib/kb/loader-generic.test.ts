import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadContent, loadKb, toResumeKb } from "@/lib/kb/loader";

const CUSTOM_ROOT = path.join(__dirname, "../../fixtures/content-custom");
const PERSONA_ROOT = path.join(__dirname, "../../fixtures/persona");

/**
 * Shared temp-root builder used by the hardening tests below.
 * Creates a minimal valid KB root (with profile.yaml + public-contact.yaml already
 * written) so each test only needs to express the delta it cares about.
 *
 * `config`  — full text for content.config.yaml (must declare at least profile + public-contact).
 * `extra`   — root-relative paths; value = file content, null = create as directory.
 */
async function makeTempRoot(
  config: string,
  extra: Record<string, string | null> = {},
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-loader-test-"));
  await fs.mkdir(path.join(root, "kb"), { recursive: true });
  await fs.writeFile(path.join(root, "kb", "profile.yaml"), "name: Test\nheadline: Tester\n");
  await fs.writeFile(path.join(root, "kb", "public-contact.yaml"), "email: test@example.com\n");
  await fs.writeFile(path.join(root, "content.config.yaml"), config);
  for (const [rel, content] of Object.entries(extra)) {
    const abs = path.join(root, rel);
    if (content === null) {
      await fs.mkdir(abs, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
  }
  return root;
}

// Minimal config preamble shared by all dynamic tests — keep profile/public-contact required.
const BASE_CONFIG = `locales: [en]
collections:
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
`;

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

// ─── Fix 1: locale-only sidecar filter ────────────────────────────────────────

describe("Fix 1 — locale-only sidecar filter (loader.ts ~line 124)", () => {
  it("includes dotted filenames (web.ui.md) and excludes only real locale sidecars", async () => {
    const root = await makeTempRoot(
      BASE_CONFIG + "  - name: articles\n    kind: markdown\n",
      {
        "kb/articles/web.ui.md": "---\n---\nBody\n",
        "kb/articles/note.md": "---\n---\nBody\n",
        // note.fr.md is a locale sidecar — must NOT appear as its own entry
        "kb/articles/note.fr.md": "---\n---\nFrench body\n",
      },
    );
    const content = await loadContent(root);
    const articles = content.collections.get("articles");
    expect(articles?.kind).toBe("markdown");
    if (articles?.kind !== "markdown") return;
    const slugs = articles.entries.map((e) => e.slug);
    // dotted filename must be present
    expect(slugs).toContain("web.ui");
    // canonical entry present
    expect(slugs).toContain("note");
    // sidecar must NOT appear as an independent entry
    expect(slugs).not.toContain("note.fr");
    expect(slugs).toHaveLength(2);
  });
});

// ─── Fix 2: cross-type sort stability ─────────────────────────────────────────

describe("Fix 2 — compareEntries cross-type total order", () => {
  it("places numbers before strings (direction-independent), strings obey dir, missing last", async () => {
    const root = await makeTempRoot(
      BASE_CONFIG + "  - name: pages\n    kind: markdown\n    sort: { field: year, order: desc }\n",
      {
        // year values: number, string, string, absent
        "kb/pages/a-num.md": "---\nyear: 2024\n---\n",
        "kb/pages/b-str.md": '---\nyear: "2023"\n---\n',
        "kb/pages/c-str.md": "---\nyear: draft\n---\n",
        "kb/pages/d-none.md": "---\n---\n",
      },
    );
    const content = await loadContent(root);
    const pages = content.collections.get("pages");
    expect(pages?.kind).toBe("markdown");
    if (pages?.kind !== "markdown") return;
    const slugs = pages.entries.map((e) => e.slug);
    // Expected desc order:
    //  1. a-num  — number 2024, type rank always beats strings
    //  2. c-str  — "draft" > "2023" lexicographically, so first in desc
    //  3. b-str  — "2023"
    //  4. d-none — missing, always last
    expect(slugs).toEqual(["a-num", "c-str", "b-str", "d-none"]);

    // Stability: second load must produce identical order
    const content2 = await loadContent(root);
    const pages2 = content2.collections.get("pages");
    expect(pages2?.kind).toBe("markdown");
    if (pages2?.kind !== "markdown") return;
    expect(pages2.entries.map((e) => e.slug)).toEqual(slugs);
  });
});

// ─── Fix 3: loud errors for non-ENOENT yaml failures ─────────────────────────

describe("Fix 3 — EISDIR on optional yaml collection propagates rather than silencing", () => {
  it("throws /failed to read/ when optional yaml collection path is a directory (EISDIR)", async () => {
    const root = await makeTempRoot(
      // glossary declared without required: true — default false (optional)
      BASE_CONFIG + "  - name: glossary\n    kind: yaml\n",
      {
        // The loader resolves the file as kb/glossary.yaml; making THAT path a
        // directory causes fs.readFile to throw EISDIR (not ENOENT).
        "kb/glossary.yaml": null,
      },
    );
    await expect(loadContent(root)).rejects.toThrow(/failed to read glossary/);
  });
});

// ─── Also: yaml absent / markdown absent-dir edge cases ───────────────────────

describe("Also — collection presence edge cases", () => {
  it("optional yaml absent → collection omitted from map", async () => {
    const root = await makeTempRoot(
      // metadata: no required: true → optional, file not written
      BASE_CONFIG + "  - name: metadata\n    kind: yaml\n",
    );
    const content = await loadContent(root);
    expect(content.collections.has("metadata")).toBe(false);
  });

  it("required yaml absent → throws /KB: failed to read/", async () => {
    const root = await makeTempRoot(
      BASE_CONFIG + "  - name: metadata\n    kind: yaml\n    required: true\n",
      // kb/metadata.yaml intentionally not written
    );
    await expect(loadContent(root)).rejects.toThrow(/KB: failed to read/);
  });

  it("markdown collection with absent directory → present with entries: []", async () => {
    const root = await makeTempRoot(
      BASE_CONFIG + "  - name: docs\n    kind: markdown\n",
      // kb/docs/ directory intentionally not created
    );
    const content = await loadContent(root);
    const docs = content.collections.get("docs");
    expect(docs?.kind).toBe("markdown");
    if (docs?.kind !== "markdown") return;
    expect(docs.entries).toEqual([]);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("loadKbManifest", () => {
  let manifest: KbFile[];

  beforeAll(async () => {
    manifest = await loadKbManifest(FIXTURE_DIR);
  });

  it("includes every public yaml and markdown file, with paths relative to the kb dir", () => {
    const paths = manifest.map((f) => f.path).sort();
    expect(paths).toEqual([
      "education.yaml",
      "experience/2020-older-co.md",
      "experience/2024-fixture-co.md",
      "profile.yaml",
      "projects/fixture-project.md",
      "public-contact.yaml",
      "recommendations/2024-09-jane-doe.md",
      "skills.yaml",
      "talks/2024-evs37.md",
    ]);
  });

  it("tags each file with its type", () => {
    const profile = manifest.find((f) => f.path === "profile.yaml");
    const exp = manifest.find((f) => f.path === "experience/2024-fixture-co.md");
    expect(profile?.type).toBe("yaml");
    expect(exp?.type).toBe("md");
  });

  it("gives every file a non-empty title", () => {
    for (const f of manifest) {
      expect(f.title.length).toBeGreaterThan(0);
    }
  });

  it("derives titles from stems, not full paths", () => {
    // yaml: stem of "profile.yaml" → "profile" → "Profile"
    const profile = manifest.find((f) => f.path === "profile.yaml");
    expect(profile?.title).toBe("Profile");

    // markdown without # H1: stem of "experience/2024-fixture-co.md" →
    // "2024-fixture-co" → "2024 fixture co"
    const exp = manifest.find((f) => f.path === "experience/2024-fixture-co.md");
    expect(exp?.title).toBe("2024 fixture co");
  });

  it("returns files sorted by path", () => {
    const paths = manifest.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
  });
});

describe("loadKbManifest — generic date frontmatter", () => {
  it("picks a generic date into meta", async () => {
    const files = await loadKbManifest(
      path.join(__dirname, "../../fixtures/content-custom/kb"),
    );
    const note = files.find((f) => f.path === "notes/2026-01-first-note.md");
    expect(note?.meta?.date).toBe("2026-01");
  });
});

describe("loadKbManifest — locale sidecar exclusion", () => {
  it("lists web.ui.md as content but excludes note.fr.md as a locale sidecar", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-sidecar-"));
    try {
      const notesDir = path.join(dir, "notes");
      await fs.mkdir(notesDir, { recursive: true });
      // canonical content file whose name happens to contain a dot-component
      await fs.writeFile(path.join(notesDir, "web.ui.md"), "---\ntitle: Web UI note\ndate: \"2026-02\"\n---\n\nBody.\n");
      // real locale sidecar — must be excluded
      await fs.writeFile(path.join(notesDir, "note.fr.md"), "---\n---\nFrench body.\n");
      // canonical file for the sidecar — must be included
      await fs.writeFile(path.join(notesDir, "note.md"), "---\n---\nBody.\n");

      const manifest = await loadKbManifest(dir);
      const paths = manifest.map((f) => f.path);

      expect(paths).toContain("notes/web.ui.md");
      expect(paths).toContain("notes/note.md");
      expect(paths).not.toContain("notes/note.fr.md");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadKbManifest — symlink safety", () => {
  it("excludes symlinks even when their name looks like a public artifact", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-symlink-"));
    try {
      // A legitimate file plus a symlink whose name ends in .md — a malicious
      // synced repo could ship `leak.md -> /etc/passwd`. The manifest must not
      // list it, or the KB-file route's whitelist would happily read it.
      await fs.writeFile(path.join(dir, "profile.yaml"), "name: ok\n");
      await fs.symlink("/etc/hosts", path.join(dir, "leak.md"));

      const manifest = await loadKbManifest(dir);
      const paths = manifest.map((f) => f.path);

      expect(paths).toContain("profile.yaml");
      expect(paths).not.toContain("leak.md");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

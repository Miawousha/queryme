import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
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
      "open-source/queryme.md",
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

  it("excludes the sensitive directory", () => {
    expect(manifest.some((f) => f.path.startsWith("sensitive/"))).toBe(false);
  });

  it("returns files sorted by path", () => {
    const paths = manifest.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
  });
});

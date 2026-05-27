import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadKb } from "@/lib/kb/loader";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("loadKb", () => {
  it("loads and validates every file in the fixture KB", async () => {
    const kb = await loadKb(FIXTURE_DIR);

    expect(kb.profile.name).toBe("Test Person");
    expect(kb.skills.skills).toHaveLength(2);
    expect(kb.skills.skills[0].name).toBe("TypeScript");
    expect(kb.education.entries[0].institution).toBe("Test University");
    expect(kb.publicContact.email).toBe("test@example.com");

    expect(kb.experience).toHaveLength(2);
    expect(kb.experience[0].slug).toBe("2024-fixture-co");
    expect(kb.experience[0].frontmatter.company).toBe("Fixture Co");
    expect(kb.experience[0].body).toContain("Fixture body.");
    expect(kb.experience[0].relativePath).toBe("experience/2024-fixture-co.md");

    expect(kb.projects).toHaveLength(1);
    expect(kb.projects[0].slug).toBe("fixture-project");
    expect(kb.projects[0].frontmatter.name).toBe("Fixture Project");
    expect(kb.projects[0].body).toContain("A fixture project body.");
    expect(kb.projects[0].relativePath).toBe("projects/fixture-project.md");
  });

  it("sorts experience entries by start date descending (most recent first)", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    expect(kb.experience.map((e) => e.slug)).toEqual(["2024-fixture-co", "2020-older-co"]);
  });

  it("throws when the root directory does not exist", async () => {
    await expect(loadKb(path.resolve(__dirname, "../../fixtures/does-not-exist"))).rejects.toThrow();
  });

  it("throws a descriptive error when a file fails schema validation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "queryme-kb-bad-"));
    try {
      await writeFile(path.join(dir, "profile.yaml"), "name: X\n"); // missing headline
      await writeFile(path.join(dir, "skills.yaml"), "skills: []\n");
      await writeFile(path.join(dir, "education.yaml"), "entries: []\n");
      await writeFile(path.join(dir, "public-contact.yaml"), "{}\n");
      await mkdir(path.join(dir, "experience"));
      await mkdir(path.join(dir, "projects"));

      await expect(loadKb(dir)).rejects.toThrow(/KB:.*profile\.yaml/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads talks, code, and recommendations entries", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    expect(kb.talks).toHaveLength(1);
    expect(kb.talks[0].frontmatter.title).toBe("Battery emulation at scale");
    expect(kb.talks[0].relativePath).toBe("talks/2024-evs37.md");

    expect(kb.code).toHaveLength(2);
    const queryme = kb.code.find((c) => c.slug === "queryme");
    expect(queryme).toBeDefined();
    expect(queryme!.frontmatter.name).toBe("queryme");
    expect(queryme!.frontmatter.visibility).toBe("public");
    expect(queryme!.relativePath).toBe("code/queryme.md");

    expect(kb.recommendations).toHaveLength(1);
    expect(kb.recommendations[0].frontmatter.from).toBe("Jane Doe");
    expect(kb.recommendations[0].relativePath).toBe("recommendations/2024-09-jane-doe.md");
  });

  it("prefers a *.fr.md sidecar when lang=fr is requested", async () => {
    const kb = await loadKb(FIXTURE_DIR, "fr");
    const fixture = kb.experience.find((e) => e.slug === "2024-fixture-co");
    expect(fixture).toBeDefined();
    expect(fixture!.body).toContain("Corps de fixture.");
    // relativePath stays canonical so citations remain stable across languages.
    expect(fixture!.relativePath).toBe("experience/2024-fixture-co.md");
  });

  it("falls back to the base file when no fr sidecar exists", async () => {
    const kb = await loadKb(FIXTURE_DIR, "fr");
    const older = kb.experience.find((e) => e.slug === "2020-older-co");
    expect(older).toBeDefined();
    // No fr sidecar — should still be the English original.
    expect(older!.body).toBeTruthy();
  });

  it("defaults to English when no lang argument is provided (back-compat)", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    const fixture = kb.experience.find((e) => e.slug === "2024-fixture-co");
    expect(fixture).toBeDefined();
    // Body comes from the canonical .md, NOT the .fr.md sidecar.
    expect(fixture!.body).not.toContain("Corps de fixture.");
  });
});

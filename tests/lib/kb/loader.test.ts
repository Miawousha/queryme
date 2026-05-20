import { describe, it, expect } from "vitest";
import path from "node:path";
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

    expect(kb.experience).toHaveLength(1);
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
    const starts = kb.experience.map((e) => e.frontmatter.start);
    const sorted = [...starts].sort((a, b) => (a < b ? 1 : -1));
    expect(starts).toEqual(sorted);
  });

  it("throws a descriptive error when a file fails validation", async () => {
    await expect(loadKb(path.resolve(__dirname, "../../fixtures/does-not-exist"))).rejects.toThrow();
  });
});

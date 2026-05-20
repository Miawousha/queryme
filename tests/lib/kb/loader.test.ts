import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadKb } from "@/lib/kb/loader";
import { encryptSensitive, generateKey } from "@/lib/kb/crypto";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

async function writeMinimalKb(dir: string) {
  await writeFile(path.join(dir, "profile.yaml"), "name: X\nheadline: Y\n");
  await writeFile(path.join(dir, "skills.yaml"), "skills: []\n");
  await writeFile(path.join(dir, "education.yaml"), "entries: []\n");
  await writeFile(path.join(dir, "public-contact.yaml"), "{}\n");
  await mkdir(path.join(dir, "experience"));
  await mkdir(path.join(dir, "projects"));
}

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

    expect(kb.sensitive.salary?.expectations).toBe("€90k–€110k");
    expect(kb.sensitive.references?.entries[0].name).toBe("Jane Doe");
    expect(kb.sensitive.privateContact?.phone).toBe("+33 6 00 00 00 00");
  });

  it("returns null sensitive sections when the sensitive directory is absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "queryme-kb-nosens-"));
    try {
      await writeFile(path.join(dir, "profile.yaml"), "name: X\nheadline: Y\n");
      await writeFile(path.join(dir, "skills.yaml"), "skills: []\n");
      await writeFile(path.join(dir, "education.yaml"), "entries: []\n");
      await writeFile(path.join(dir, "public-contact.yaml"), "{}\n");
      await mkdir(path.join(dir, "experience"));
      await mkdir(path.join(dir, "projects"));
      const kb = await loadKb(dir);
      expect(kb.sensitive.salary).toBeNull();
      expect(kb.sensitive.references).toBeNull();
      expect(kb.sensitive.privateContact).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sorts experience entries by start date descending (most recent first)", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    expect(kb.experience.map((e) => e.slug)).toEqual(["2024-fixture-co", "2020-older-co"]);
  });

  it("decrypts an encrypted sensitive file when KB_SENSITIVE_KEY is set", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "queryme-kb-enc-"));
    const key = generateKey();
    const prev = process.env.KB_SENSITIVE_KEY;
    process.env.KB_SENSITIVE_KEY = key;
    try {
      await writeMinimalKb(dir);
      await mkdir(path.join(dir, "sensitive"));
      await writeFile(
        path.join(dir, "sensitive", "salary.yaml.enc"),
        encryptSensitive('expectations: "€200k"\n', key),
      );
      const kb = await loadKb(dir);
      expect(kb.sensitive.salary?.expectations).toBe("€200k");
    } finally {
      if (prev === undefined) delete process.env.KB_SENSITIVE_KEY;
      else process.env.KB_SENSITIVE_KEY = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed — returns null sensitive content when an .enc file exists but the key is absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "queryme-kb-nokey-"));
    const prev = process.env.KB_SENSITIVE_KEY;
    delete process.env.KB_SENSITIVE_KEY;
    try {
      await writeMinimalKb(dir);
      await mkdir(path.join(dir, "sensitive"));
      await writeFile(
        path.join(dir, "sensitive", "salary.yaml.enc"),
        encryptSensitive('expectations: "€200k"\n', generateKey()),
      );
      const kb = await loadKb(dir);
      expect(kb.sensitive.salary).toBeNull();
    } finally {
      if (prev !== undefined) process.env.KB_SENSITIVE_KEY = prev;
      await rm(dir, { recursive: true, force: true });
    }
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
});

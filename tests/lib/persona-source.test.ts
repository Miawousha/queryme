import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGitHubRepoUrl, validatePersonaTree, syncFromGitHub, getActivePersonaRoot } from "@/lib/persona-source";
import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";
import { mswServer } from "../../vitest.setup";
import { FAKE_SHA, happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";

describe("parseGitHubRepoUrl", () => {
  it("parses https://github.com/owner/repo", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("strips a trailing slash", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content/")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("strips a trailing .git", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content.git")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("rejects an SSH URL", () => {
    expect(() => parseGitHubRepoUrl("git@github.com:alex/queryme-content.git")).toThrow(
      /must start with https:\/\/github.com\//,
    );
  });

  it("rejects a URL with extra path segments", () => {
    expect(() =>
      parseGitHubRepoUrl("https://github.com/alex/queryme-content/tree/main"),
    ).toThrow(/extra path segments/);
  });

  it("rejects a non-github host", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/alex/repo")).toThrow(
      /must start with https:\/\/github.com\//,
    );
  });
});

function makeTreeWith(filesPresent: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "queryme-persona-test-"));
  for (const rel of filesPresent) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "ok");
  }
  return dir;
}

describe("validatePersonaTree", () => {
  const REQUIRED = [
    "persona.yaml",
    "prompts/system.md",
    "kb/profile.yaml",
    "kb/profile.fr.yaml",
    "kb/public-contact.yaml",
    "kb/public-contact.fr.yaml",
    "kb/skills.yaml",
    "kb/skills.fr.yaml",
    "kb/education.yaml",
    "kb/education.fr.yaml",
  ];

  it("returns null when all required files exist", () => {
    const dir = makeTreeWith(REQUIRED);
    expect(validatePersonaTree(dir)).toBeNull();
  });

  it("returns an error listing the missing files", () => {
    const dir = makeTreeWith(REQUIRED.filter((f) => f !== "kb/skills.yaml"));
    const result = validatePersonaTree(dir);
    expect(result).toMatch(/missing required file/i);
    expect(result).toContain("kb/skills.yaml");
  });

  it("aggregates multiple missing files in one message", () => {
    const dir = makeTreeWith([]);
    const result = validatePersonaTree(dir);
    expect(result).toContain("persona.yaml");
    expect(result).toContain("prompts/system.md");
  });
});

const MIN_REQUIRED_FILES: Record<string, string> = {
  "persona.yaml":
    'id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n  fr:\n    possessive: leur\n    objectPronoun: les\n    subjectPronoun: ils\n',
  "prompts/system.md": "system prompt body",
  "kb/profile.yaml":
    "name: Test Person\nheadline: Test\nlocation: Earth\nlanguages: [en]\n",
  "kb/profile.fr.yaml":
    "name: Personne Test\nheadline: Test\nlocation: Terre\nlanguages: [fr]\n",
  "kb/public-contact.yaml": "email: test@example.com\n",
  "kb/public-contact.fr.yaml": "email: test@example.com\n",
  "kb/skills.yaml": "skills: []\n",
  "kb/skills.fr.yaml": "skills: []\n",
  "kb/education.yaml": "education: []\n",
  "kb/education.fr.yaml": "education: []\n",
};

describe("syncFromGitHub — happy path", () => {
  let cacheRoot: string;

  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data. " +
        "Point POSTGRES_URL at a test branch or truncate the table first.",
      );
    }
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-test-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    await getDb().delete(personaSource);
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
  });

  it("downloads, extracts, validates, flips the symlink, and writes a DB row", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.commitSha).toBe(FAKE_SHA);

    // Symlink points at the extracted SHA dir.
    const target = readlinkSync(`${cacheRoot}/current`);
    expect(target).toContain(FAKE_SHA);
    expect(getActivePersonaRoot()).toBe(target);

    // Required files reachable through the symlink.
    expect(readFileSync(`${cacheRoot}/current/persona.yaml`, "utf8")).toContain("test-persona");

    // DB row recorded.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].commitSha).toBe(FAKE_SHA);
    expect(rows[0].status).toBe("ok");
  });
});

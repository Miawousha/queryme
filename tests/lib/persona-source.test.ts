import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGitHubRepoUrl, validatePersonaTree } from "@/lib/persona-source";

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

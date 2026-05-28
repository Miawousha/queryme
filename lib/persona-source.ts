/**
 * Resolves the active persona's content directory and synchronises it from a
 * public GitHub repository. The KB / prompt / cv-config loaders read from
 * `getActivePersonaRoot()` instead of `process.cwd()`; this module is the
 * only writer of that path.
 */

import fs from "node:fs";
import path from "node:path";

export type ParsedRepo = { owner: string; repo: string };

const GITHUB_PREFIX = "https://github.com/";

export function parseGitHubRepoUrl(input: string): ParsedRepo {
  if (!input.startsWith(GITHUB_PREFIX)) {
    throw new Error(`Repo URL must start with ${GITHUB_PREFIX}`);
  }
  let rest = input.slice(GITHUB_PREFIX.length).replace(/\/$/, "");
  if (rest.endsWith(".git")) rest = rest.slice(0, -".git".length);
  const parts = rest.split("/");
  if (parts.length !== 2) {
    throw new Error(`Repo URL has extra path segments — expected /owner/repo only`);
  }
  const [owner, repo] = parts;
  if (!owner || !repo) {
    throw new Error(`Repo URL is missing owner or repo`);
  }
  return { owner, repo };
}

export const REQUIRED_PERSONA_FILES = [
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
] as const;

/**
 * Returns `null` if every required file exists in `root`. Otherwise returns
 * a single human-readable error message listing the missing relative paths.
 */
export function validatePersonaTree(root: string): string | null {
  const missing = REQUIRED_PERSONA_FILES.filter(
    (rel) => !fs.existsSync(path.join(root, rel)),
  );
  if (missing.length === 0) return null;
  return `missing required file(s): ${missing.join(", ")}`;
}

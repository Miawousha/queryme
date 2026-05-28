/**
 * Resolves the active persona's content directory and synchronises it from a
 * public GitHub repository. The KB / prompt / cv-config loaders read from
 * `getActivePersonaRoot()` instead of `process.cwd()`; this module is the
 * only writer of that path.
 */

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

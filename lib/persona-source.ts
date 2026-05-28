/**
 * Resolves the active persona's content directory and synchronises it from a
 * public GitHub repository. The KB / prompt / cv-config loaders read from
 * `getActivePersonaRoot()` instead of `process.cwd()`; this module is the
 * only writer of that path.
 */

import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
import { Readable } from "node:stream";
import { rm, mkdir, rename, symlink } from "node:fs/promises";
import { getDb } from "@/lib/db/client";
import { personaSource, type PersonaSource } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

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

// ---------------------------------------------------------------------------
// Sync orchestrator
// ---------------------------------------------------------------------------

export type SyncResult =
  | { kind: "ok"; commitSha: string; syncedAt: Date }
  | { kind: "error"; message: string };

function cacheRoot(): string {
  return process.env.PERSONA_CACHE_ROOT ?? "/tmp/queryme/persona-cache";
}

let inFlight: Promise<SyncResult> | null = null;

export async function syncFromGitHub(
  repoUrl: string,
  branch = "main",
): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = doSync(repoUrl, branch).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function extractTarball(buf: Buffer, targetDir: string): Promise<void> {
  const extractor = tar.x({ cwd: targetDir, strip: 1 });
  await new Promise<void>((resolve, reject) => {
    extractor.once("finish", () => resolve());
    extractor.once("error", reject);
    Readable.from(buf).pipe(extractor);
  });
}

async function doSync(repoUrl: string, branch: string): Promise<SyncResult> {
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRow(repoUrl, branch, "unknown", "error", message);
    return { kind: "error", message };
  }

  // Resolve latest commit SHA on the requested branch.
  let sha: string;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) throw new Error(`GitHub commits API returned ${res.status}`);
    const body = (await res.json()) as { sha?: string };
    if (typeof body.sha !== "string") throw new Error("commits API response missing sha");
    sha = body.sha;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRow(repoUrl, branch, "unknown", "error", message);
    return { kind: "error", message };
  }

  // Download tarball + extract.
  const targetDir = `${cacheRoot()}/${sha}`;
  try {
    const res = await fetch(
      `https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`,
    );
    if (!res.ok) throw new Error(`tarball fetch returned ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await extractTarball(buf, targetDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await rm(targetDir, { recursive: true, force: true });
    await recordRow(repoUrl, branch, sha, "error", message);
    return { kind: "error", message };
  }

  // Validate required files.
  const missing = validatePersonaTree(targetDir);
  if (missing) {
    await rm(targetDir, { recursive: true, force: true });
    await recordRow(repoUrl, branch, sha, "error", missing);
    return { kind: "error", message: missing };
  }

  // Atomically flip the symlink.
  const linkPath = `${cacheRoot()}/current`;
  const tmpLink = `${cacheRoot()}/current.new`;
  await rm(tmpLink, { recursive: true, force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);

  // Persist DB row.
  const row = await recordRow(repoUrl, branch, sha, "ok", null);

  return { kind: "ok", commitSha: sha, syncedAt: row.syncedAt };
}

async function recordRow(
  repoUrl: string,
  branch: string,
  commitSha: string,
  status: "ok" | "error",
  error: string | null,
): Promise<PersonaSource> {
  const [row] = await getDb()
    .insert(personaSource)
    .values({ repoUrl, branch, commitSha, status, error })
    .returning();
  return row;
}

export function getActivePersonaRoot(): string | null {
  if (process.env.PERSONA_LOCAL_OVERRIDE) {
    return process.env.PERSONA_LOCAL_OVERRIDE;
  }
  const link = `${cacheRoot()}/current`;
  try {
    return fs.readlinkSync(link);
  } catch {
    return null;
  }
}

export async function getActivePersonaSourceRow(): Promise<PersonaSource | null> {
  const [row] = await getDb()
    .select()
    .from(personaSource)
    .where(eq(personaSource.status, "ok"))
    .orderBy(desc(personaSource.syncedAt))
    .limit(1);
  return row ?? null;
}

export async function listSyncHistory(limit = 10): Promise<PersonaSource[]> {
  return getDb()
    .select()
    .from(personaSource)
    .orderBy(desc(personaSource.syncedAt))
    .limit(limit);
}

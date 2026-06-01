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
import { rm, mkdir, rename, symlink, readdir } from "node:fs/promises";
import { getDb } from "@/lib/db/client";
import { personaSource, type PersonaSource } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { resetKbCache } from "@/lib/kb/cache";
import { _resetPromptCache } from "@/lib/prompts";
import { _resetPersonaCache } from "@/lib/persona";

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
  const VALID_SEGMENT = /^[A-Za-z0-9._-]+$/;
  if (!VALID_SEGMENT.test(owner) || !VALID_SEGMENT.test(repo)) {
    throw new Error(`Repo URL has an invalid owner or repo name`);
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

/**
 * Resolves the latest commit SHA on `branch` for the given repo. Extracted so
 * the CLI's dry-run can preview the would-sync SHA without downloading the
 * tarball; `doSync` reuses it too.
 */
export async function resolveLatestSha(repoUrl: string, branch: string): Promise<string> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`GitHub commits API returned ${res.status}`);
  const body = (await res.json()) as { sha?: string };
  if (typeof body.sha !== "string") throw new Error("commits API response missing sha");
  return body.sha;
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
    sha = await resolveLatestSha(repoUrl, branch);
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

  // Invalidate in-process caches so the next read picks up the new SHA.
  resetKbCache();
  _resetPromptCache();
  _resetPersonaCache();

  // Keep current + previous SHA dirs; delete older ones.
  await cleanupOldShas(sha);

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

export async function ensurePersonaCacheReady(): Promise<void> {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return;
  const linkPath = `${cacheRoot()}/current`;
  if (fs.existsSync(linkPath)) return;

  const active = await getActivePersonaSourceRow();
  if (!active) return; // no persona configured at all → caller renders setup screen.

  // Re-fetch the recorded SHA's tarball into the cache. Uses the same
  // extract/validate/flip path as a sync, but does NOT resolve "latest" —
  // we want byte-identity with the row's recorded SHA.
  await refetchFromRecorded(active.repoUrl, active.branch, active.commitSha);
}

async function refetchFromRecorded(repoUrl: string, branch: string, sha: string): Promise<void> {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const targetDir = `${cacheRoot()}/${sha}`;
  const res = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`);
  if (!res.ok) throw new Error(`cold-start refetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await extractTarball(buf, targetDir);

  const missing = validatePersonaTree(targetDir);
  if (missing) throw new Error(`cold-start refetch validation failed: ${missing}`);

  const linkPath = `${cacheRoot()}/current`;
  const tmpLink = `${cacheRoot()}/current.new`;
  await rm(tmpLink, { recursive: true, force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);
}

async function cleanupOldShas(currentSha: string): Promise<void> {
  const root = cacheRoot();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  // Recent SHAs by DB synced_at — keep the current + the one before.
  const recent = await getDb()
    .select()
    .from(personaSource)
    .where(eq(personaSource.status, "ok"))
    .orderBy(desc(personaSource.syncedAt))
    .limit(2);
  const keep = new Set(recent.map((r) => r.commitSha));
  keep.add(currentSha);

  for (const name of entries) {
    if (name === "current" || name === "current.new") continue;
    if (keep.has(name)) continue;
    await rm(`${root}/${name}`, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Per-account helpers
// ---------------------------------------------------------------------------

function accountCacheRoot(accountId: string): string {
  return path.join(cacheRoot(), accountId);
}

// Per-account in-flight dedupe (separate from the global `inFlight`).
const inFlightByAccount = new Map<string, Promise<SyncResult>>();

export function getPersonaRootForAccount(accountId: string): string | null {
  // PERSONA_LOCAL_OVERRIDE wins for any account (dev/test shortcut).
  if (process.env.PERSONA_LOCAL_OVERRIDE) {
    return process.env.PERSONA_LOCAL_OVERRIDE;
  }
  const link = path.join(accountCacheRoot(accountId), "current");
  try {
    return fs.readlinkSync(link);
  } catch {
    return null;
  }
}

export async function getActivePersonaSourceRowForAccount(
  accountId: string,
): Promise<PersonaSource | null> {
  const [row] = await getDb()
    .select()
    .from(personaSource)
    .where(
      and(
        eq(personaSource.accountId, accountId),
        eq(personaSource.status, "ok"),
      ),
    )
    .orderBy(desc(personaSource.syncedAt))
    .limit(1);
  return row ?? null;
}

export async function listSyncHistoryForAccount(
  accountId: string,
  limit = 10,
): Promise<PersonaSource[]> {
  return getDb()
    .select()
    .from(personaSource)
    .where(eq(personaSource.accountId, accountId))
    .orderBy(desc(personaSource.syncedAt))
    .limit(limit);
}

export async function syncFromGitHubForAccount(
  accountId: string,
  repoUrl: string,
  branch = "main",
): Promise<SyncResult> {
  const existing = inFlightByAccount.get(accountId);
  if (existing) return existing;
  const promise = doSyncForAccount(accountId, repoUrl, branch).finally(() => {
    inFlightByAccount.delete(accountId);
  });
  inFlightByAccount.set(accountId, promise);
  return promise;
}

export async function ensurePersonaCacheReadyForAccount(accountId: string): Promise<void> {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return;
  const linkPath = path.join(accountCacheRoot(accountId), "current");
  if (fs.existsSync(linkPath)) return;

  const active = await getActivePersonaSourceRowForAccount(accountId);
  if (!active) return; // no persona configured for this account

  await refetchFromRecordedForAccount(accountId, active.repoUrl, active.branch, active.commitSha);
}

async function refetchFromRecordedForAccount(
  accountId: string,
  repoUrl: string,
  branch: string,
  sha: string,
): Promise<void> {
  const root = accountCacheRoot(accountId);
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);
  const targetDir = path.join(root, sha);
  const res = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`);
  if (!res.ok) throw new Error(`cold-start refetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await extractTarball(buf, targetDir);

  const missing = validatePersonaTree(targetDir);
  if (missing) throw new Error(`cold-start refetch validation failed: ${missing}`);

  const linkPath = path.join(root, "current");
  const tmpLink = path.join(root, "current.new");
  await rm(tmpLink, { recursive: true, force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);
}

async function doSyncForAccount(
  accountId: string,
  repoUrl: string,
  branch: string,
): Promise<SyncResult> {
  const root = accountCacheRoot(accountId);

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRowForAccount(accountId, repoUrl, branch, "unknown", "error", message);
    return { kind: "error", message };
  }

  let sha: string;
  try {
    sha = await resolveLatestSha(repoUrl, branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRowForAccount(accountId, repoUrl, branch, "unknown", "error", message);
    return { kind: "error", message };
  }

  const targetDir = path.join(root, sha);
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
    await recordRowForAccount(accountId, repoUrl, branch, sha, "error", message);
    return { kind: "error", message };
  }

  const missing = validatePersonaTree(targetDir);
  if (missing) {
    await rm(targetDir, { recursive: true, force: true });
    await recordRowForAccount(accountId, repoUrl, branch, sha, "error", missing);
    return { kind: "error", message: missing };
  }

  // Atomically flip the per-account symlink.
  const linkPath = path.join(root, "current");
  const tmpLink = path.join(root, "current.new");
  await rm(tmpLink, { recursive: true, force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);

  const row = await recordRowForAccount(accountId, repoUrl, branch, sha, "ok", null);

  resetKbCache();
  _resetPromptCache();
  _resetPersonaCache();

  await cleanupOldShasForAccount(accountId, sha);

  return { kind: "ok", commitSha: sha, syncedAt: row.syncedAt };
}

async function recordRowForAccount(
  accountId: string,
  repoUrl: string,
  branch: string,
  commitSha: string,
  status: "ok" | "error",
  error: string | null,
): Promise<PersonaSource> {
  const [row] = await getDb()
    .insert(personaSource)
    .values({ repoUrl, branch, commitSha, status, error, accountId })
    .returning();
  return row;
}

async function cleanupOldShasForAccount(accountId: string, currentSha: string): Promise<void> {
  const root = accountCacheRoot(accountId);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  // Keep current + previous SHA for this account only.
  const recent = await getDb()
    .select()
    .from(personaSource)
    .where(eq(personaSource.accountId, accountId))
    .orderBy(desc(personaSource.syncedAt))
    .limit(2);
  const keep = new Set(recent.map((r) => r.commitSha));
  keep.add(currentSha);

  for (const name of entries) {
    if (name === "current" || name === "current.new") continue;
    if (keep.has(name)) continue;
    await rm(path.join(root, name), { recursive: true, force: true });
  }
}

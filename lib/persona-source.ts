/**
 * Resolves the active persona's content directory and synchronises it from a
 * public GitHub repository. Per-account resolution is provided by the
 * `*ForAccount` family of functions; the `PersonaStore` interface wraps them.
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
import { _resetPersonaCache, parsePersonaFile } from "@/lib/persona";
import { loadContent } from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
import {
  loadContentConfig,
  resolveContentConfig,
  type ResolvedContentConfig,
} from "@/lib/kb/content-config";

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

/** Files every persona repo needs regardless of its content config. */
export const BASE_REQUIRED_PERSONA_FILES = ["persona.yaml", "prompts/system.md"] as const;

/**
 * The sync gate's required-file list, derived from the content config:
 * the base files plus, for every `required: true` yaml collection, the
 * canonical file and one localized sibling per extra declared locale.
 */
export function requiredPersonaFiles(config: ResolvedContentConfig): string[] {
  const files: string[] = [...BASE_REQUIRED_PERSONA_FILES];
  const extraLocales = config.locales.slice(1); // first locale is canonical (bare filename)
  for (const col of config.collections) {
    if (col.kind !== "yaml" || !col.required) continue;
    files.push(`kb/${col.name}.yaml`);
    for (const locale of extraLocales) files.push(`kb/${col.name}.${locale}.yaml`);
  }
  return files;
}

/**
 * Returns `null` if the tree is valid. Otherwise returns a single
 * human-readable error: either an invalid `content.config.yaml` (when present)
 * or the list of missing required files.
 */
export function validatePersonaTree(root: string): string | null {
  let config: ResolvedContentConfig;
  try {
    config = resolveContentConfig(loadContentConfig(root));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const missing = requiredPersonaFiles(config).filter(
    (rel) => !fs.existsSync(path.join(root, rel)),
  );
  if (missing.length === 0) return null;
  return `missing required file(s): ${missing.join(", ")}`;
}

/**
 * Deep validation: runs the exact load + assembly the live page (and `pnpm
 * validate:kb`) runs — persona.yaml parsing plus the full KB load — so schema
 * errors fail the sync instead of surfacing on the user's page. Validates
 * every supported language, not just the declared locales: serving honors a
 * client-requested language regardless, and locale sidecars fall back to the
 * canonical files, so an undeclared locale is at worst a cheap re-validation.
 * Reads `root` directly (never the active symlink or PERSONA_LOCAL_OVERRIDE)
 * and caches nothing. Returns `null` when valid, else the loader's
 * descriptive error message.
 */
export async function validatePersonaTreeDeep(root: string): Promise<string | null> {
  let message: string | null = null;
  try {
    parsePersonaFile(root);
  } catch (err) {
    message = `persona.yaml: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (message === null) {
    for (const lang of ["en", "fr"] as const) {
      try {
        assembleContentText(await loadContent(root, lang));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message = lang === "en" ? msg : `[${lang}] ${msg}`;
        break;
      }
    }
  }
  if (message === null) return null;
  // Loader errors embed absolute paths under the extraction dir; relativize
  // so sync-history errors read like the repo paths the user can act on.
  return message.replaceAll(`${root}${path.sep}`, "");
}

/**
 * Resolves the latest commit SHA on `branch` for the given repo. Extracted so
 * the CLI's dry-run can preview the would-sync SHA without downloading the
 * tarball; `doSyncForAccount` reuses it too.
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
// Sync helpers (shared by all *ForAccount functions)
// ---------------------------------------------------------------------------

export type SyncResult =
  | { kind: "ok"; commitSha: string; syncedAt: Date }
  | { kind: "error"; message: string };

function cacheRoot(): string {
  return process.env.PERSONA_CACHE_ROOT ?? "/tmp/queritae/persona-cache";
}

const MB = 1024 * 1024;
const DEFAULT_TARBALL_MAX_BYTES = 50 * MB;

export function tarballMaxBytes(): number {
  const override = Number(process.env.PERSONA_TARBALL_MAX_BYTES);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_TARBALL_MAX_BYTES;
}

/**
 * Buffers a tarball response while enforcing a byte cap. The tarball comes
 * from a tenant-controlled repo, so an unbounded `res.arrayBuffer()` would let
 * a multi-GB repo OOM the serverless function. Rejects up front when
 * Content-Length already exceeds the cap, otherwise counts bytes while
 * streaming and aborts as soon as the cap is crossed.
 */
export async function bufferTarballWithLimit(
  res: Response,
  maxBytes = tarballMaxBytes(),
): Promise<Buffer> {
  const limitLabel = maxBytes % MB === 0 ? `${maxBytes / MB} MB` : `${maxBytes} bytes`;
  const limitError = () => new Error(`tarball exceeds the ${limitLabel} limit`);
  // Number(null) is 0, Number("garbage") is NaN — both fall through to streaming.
  if (Number(res.headers.get("content-length")) > maxBytes) {
    res.body?.cancel().catch(() => {});
    throw limitError();
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw limitError();
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    // Best-effort cleanup, deliberately not awaited: cancel() never settles on
    // some intercepted streams (MSW in tests), and the limit error must
    // propagate either way.
    reader.cancel().catch(() => {});
    throw err;
  }
  return Buffer.concat(chunks);
}

export async function extractTarball(buf: Buffer, targetDir: string): Promise<void> {
  const extractor = tar.x({
    cwd: targetDir,
    strip: 1,
    // The tarball comes from an untrusted, tenant-controlled GitHub repo.
    // node-tar already strips leading `/` and `..` from entry paths, but it
    // does NOT sanitize symlink/hardlink targets — a `leak.md -> /etc/passwd`
    // entry would otherwise be created and later read through the KB-file
    // route. Drop every link entry; persona content is only plain files/dirs.
    filter: (_path, entry) =>
      !("type" in entry) || (entry.type !== "SymbolicLink" && entry.type !== "Link"),
  });
  await new Promise<void>((resolve, reject) => {
    extractor.once("finish", () => resolve());
    extractor.once("error", reject);
    Readable.from(buf).pipe(extractor);
  });
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

// Throttle how often a warm instance re-checks the DB for a newer active SHA.
// Without this, every request would issue a freshness query; with it, at most
// one query per account per window.
const FRESHNESS_TTL_MS = 30_000;
const lastFreshnessCheckByAccount = new Map<string, number>();

// Dedupe concurrent refetches of the same account so two requests can't run
// rm/extract against the same target directory at once.
const refetchInFlightByAccount = new Map<string, Promise<void>>();
function dedupedRefetch(
  accountId: string,
  repoUrl: string,
  branch: string,
  sha: string,
): Promise<void> {
  const existing = refetchInFlightByAccount.get(accountId);
  if (existing) return existing;
  const p = refetchFromRecordedForAccount(accountId, repoUrl, branch, sha).finally(() => {
    refetchInFlightByAccount.delete(accountId);
  });
  refetchInFlightByAccount.set(accountId, p);
  return p;
}

type ActiveSource = { repoUrl: string; branch: string; commitSha: string };

export type PersonaFreshnessDeps = {
  readCurrentSha: () => string | null;
  getActive: () => Promise<ActiveSource | null>;
  refetch: (active: ActiveSource) => Promise<void>;
  resetCaches: () => void;
};

/**
 * Decides whether the locally-cached persona is stale relative to the active
 * source row (which another serverless instance may have advanced) and, if so,
 * refetches it and clears this instance's in-memory caches. Pure orchestration
 * over injected effects, so it is unit-testable without a DB or filesystem.
 */
export async function refreshPersonaIfStale(
  deps: PersonaFreshnessDeps,
): Promise<"no-active" | "fresh" | "refreshed"> {
  const active = await deps.getActive();
  if (!active) return "no-active";
  if (deps.readCurrentSha() === active.commitSha) return "fresh";
  await deps.refetch(active);
  deps.resetCaches();
  return "refreshed";
}

export async function ensurePersonaCacheReadyForAccount(accountId: string): Promise<void> {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return;
  const linkPath = path.join(accountCacheRoot(accountId), "current");

  // Cold start: no local cache yet — materialize the active source.
  if (!fs.existsSync(linkPath)) {
    const active = await getActivePersonaSourceRowForAccount(accountId);
    if (!active) return; // no persona configured for this account
    await dedupedRefetch(accountId, active.repoUrl, active.branch, active.commitSha);
    return;
  }

  // Warm: throttled freshness check. Another instance may have synced newer
  // content; without this, this instance serves the old persona until it is
  // recycled. Stamp the check time before the await so concurrent requests
  // within the window don't all query.
  const now = Date.now();
  if (now - (lastFreshnessCheckByAccount.get(accountId) ?? 0) < FRESHNESS_TTL_MS) return;
  lastFreshnessCheckByAccount.set(accountId, now);

  try {
    await refreshPersonaIfStale({
      readCurrentSha: () => {
        try {
          return path.basename(fs.readlinkSync(linkPath));
        } catch {
          return null;
        }
      },
      getActive: () => getActivePersonaSourceRowForAccount(accountId),
      refetch: (active) =>
        dedupedRefetch(accountId, active.repoUrl, active.branch, active.commitSha),
      resetCaches: () => {
        resetKbCache(accountId);
        _resetPromptCache(accountId);
        _resetPersonaCache();
      },
    });
  } catch (err) {
    // A failed freshness refresh must never break serving — keep the current
    // (possibly stale) cache and try again after the throttle window.
    console.error(`persona freshness refresh failed for account ${accountId}`, err);
  }
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
  const buf = await bufferTarballWithLimit(res);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await extractTarball(buf, targetDir);

  // Shallow check only — this re-materializes a SHA a past sync already
  // recorded as "ok". Deep (schema) validation here would brick cold-start
  // for rows synced before deep validation existed; the sync path is the
  // schema gate for anything new.
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
  // Extract into a staging dir so a failed fetch or validation never touches
  // the dir the active symlink may be serving from (same-SHA re-sync).
  const stagingDir = `${targetDir}.staging`;
  try {
    const res = await fetch(
      `https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`,
    );
    if (!res.ok) throw new Error(`tarball fetch returned ${res.status}`);
    const buf = await bufferTarballWithLimit(res);
    await rm(stagingDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });
    await extractTarball(buf, stagingDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await rm(stagingDir, { recursive: true, force: true });
    await recordRowForAccount(accountId, repoUrl, branch, sha, "error", message);
    return { kind: "error", message };
  }

  const invalid =
    validatePersonaTree(stagingDir) ?? (await validatePersonaTreeDeep(stagingDir));
  if (invalid) {
    await rm(stagingDir, { recursive: true, force: true });
    await recordRowForAccount(accountId, repoUrl, branch, sha, "error", invalid);
    return { kind: "error", message: invalid };
  }

  // Promote the validated tree with rename-aside (two metadata-only renames)
  // so the dir the active symlink may already point at — same-SHA re-sync —
  // is never absent for the duration of a recursive rm. Orphaned `.old` and
  // `.staging` dirs from a crash are swept by cleanupOldShasForAccount.
  const oldDir = `${targetDir}.old`;
  await rm(oldDir, { recursive: true, force: true });
  try {
    await rename(targetDir, oldDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await rename(stagingDir, targetDir);
  await rm(oldDir, { recursive: true, force: true });
  const linkPath = path.join(root, "current");
  const tmpLink = path.join(root, "current.new");
  await rm(tmpLink, { recursive: true, force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);

  const row = await recordRowForAccount(accountId, repoUrl, branch, sha, "ok", null);

  // Invalidate only THIS account's caches (other accounts' content is unchanged).
  // _resetPersonaCache is a clear-all (persona is keyed by root path, not account);
  // persona objects are tiny so the over-clear is harmless.
  resetKbCache(accountId);
  _resetPromptCache(accountId);
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

  // Keep current + previous SHA for this account only. Filter by status='ok'
  // (matching the legacy cleanupOldShas) so a run of recent error syncs can't
  // evict the last good cache dir from the keep-set.
  const recent = await getDb()
    .select()
    .from(personaSource)
    .where(and(eq(personaSource.accountId, accountId), eq(personaSource.status, "ok")))
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

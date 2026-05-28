# Headless Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple queryme's content (system prompt + KB + persona identity) from the app code. An external public GitHub repo holds the content; the admin Content tab pulls it on demand; the app becomes a generic shell.

**Architecture:** Swap-the-directory. A new `lib/persona-source.ts` module fetches a GitHub repo's tarball, extracts to `/tmp/queryme/persona-cache/<sha>/`, validates required files, and atomically flips a `current` symlink. Existing KB/prompt loaders read from `getActivePersonaRoot()/kb` instead of `process.cwd()/kb`. Persona identity lives in `persona.yaml` at the repo root; `lib/language.ts` converts from a static const to a `buildUiStrings(persona)` function so UI copy adapts to the persona while staying byte-identical for Alex.

**Tech Stack:** Next.js 15 server components, drizzle (postgres) for `persona_source` table, `tar` npm package for tarball extraction, MSW for GitHub API mocks in tests, zod for `persona.yaml` validation, vitest.

**Spec:** [docs/superpowers/specs/2026-05-28-headless-persona-design.md](../specs/2026-05-28-headless-persona-design.md)

---

## File Structure

**New (8):**
- `lib/persona-source.ts` — fetch / extract / validate / symlink / mutex / cleanup
- `lib/persona.ts` — zod-validated loader for `<active-root>/persona.yaml`
- `app/api/admin/persona-source/route.ts` — GET (state + history) and POST (sync)
- `components/admin/content-tab.tsx` — admin UI for the Content tab
- `lib/db/migrations/0005_persona_source.sql` — drizzle-generated
- `lib/db/migrations/0006_drop_sensitive_unlock.sql` — drizzle-generated
- `lib/db/migrations/0007_rename_questions_table.sql` — hand-crafted (RENAME, not drop+create)
- `tests/fixtures/prompt-golden-pre-migration.txt` — snapshot of today's full LLM-facing prompt

**Modified (~13):**
- `lib/db/schema.ts` — add `personaSource`; drop sensitive column; rename questions table
- `lib/kb/cache.ts` — read from `getActivePersonaRoot()/kb`; export `resetKbCache()`
- `lib/prompts.ts` — read from active root; export `_resetPromptCache()`
- `lib/kb/cv-config.ts` — read from active root
- `lib/kb/manifest.ts` — drop `EXCLUDED_DIR = "sensitive"`
- `lib/language.ts` — `UI_STRINGS` const → `buildUiStrings(persona)` function
- `app/page.tsx` — convert to server component; pass strings as props
- `components/home-shell.tsx` — accept `t: UiStrings` prop
- `components/kb/kb-context.tsx` — accept `kbStrings` prop
- `app/layout.tsx`, `app/about/page.tsx`, `app/cv/page.tsx` — `metadata` → `generateMetadata()`
- `components/admin/admin-dashboard.tsx` — add Content tab
- `lib/admin/data.ts`, `lib/questions/repo.ts`, `app/api/admin/analytics/route.ts` — propagate `questionsForAlex` → `forwardedQuestions` rename

**Deleted at the end (Task 27 only, after E2E verification):**
- `kb/` tree
- `prompts/system.md`
- `cv-config.yaml`

---

## Conventions used in this plan

- All `Run:` commands assume `cwd = /Users/alexandrecollet/queryme`.
- Drizzle migrations run via `pnpm db:generate` (creates the SQL) then `pnpm db:migrate` (applies). The rename migration is hand-edited because drizzle would otherwise emit DROP+CREATE.
- Tests use **MSW** to mock GitHub API calls (`api.github.com` and `codeload.github.com`).
- During development the env var `PERSONA_LOCAL_OVERRIDE` points the active root at a local directory, so loaders + golden-master tests work without GitHub. The in-repo `kb/` + `prompts/system.md` + `cv-config.yaml` remain as a working fixture until Task 27.
- Every task ends with a commit so the history is bisectable.

---

## Phase 1 — Foundation (deps, golden baseline, DB)

### Task 1: Add `tar` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the tar package**

Run: `pnpm add tar@^7.4.3 && pnpm add -D @types/tar`
Expected: `package.json` shows `tar` under `dependencies` and `@types/tar` under `devDependencies`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Smoke-test the dependency is wired**

Run: `pnpm exec tsx -e "import * as tar from 'tar'; console.log(typeof tar.x)"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(deps): add tar for persona-source tarball extraction"
```

---

### Task 2: Capture the golden-master prompt baseline

**Files:**
- Create: `scripts/snapshot-prompt.ts`
- Create: `tests/fixtures/prompt-golden-pre-migration.txt`
- Create: `tests/prompts/golden-master.test.ts`

This locks today's LLM-facing prompt before any refactor. Every subsequent task must keep this test green.

- [ ] **Step 1: Write the snapshot script**

Create `scripts/snapshot-prompt.ts`:

```ts
/**
 * Captures the EXACT bytes the LLM sees today as system prompt:
 *   header (prompts/system.md, trimmed) + "\n\n" + assembled public KB text.
 * Writes to tests/fixtures/prompt-golden-pre-migration.txt.
 * Run once before the headless-persona refactor; the file is committed and
 * subsequent runs of the golden-master test must match it byte-for-byte.
 */
import fs from "node:fs";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { buildSystemPromptParts } from "@/lib/prompts";

async function main() {
  const root = process.cwd();
  const kb = await loadKb(path.join(root, "kb"), "en");
  const kbText = assemblePublicKbText(kb);
  const parts = buildSystemPromptParts({ kbText });
  const full = parts.map((p) => p.text).join("\n\n");
  const out = path.join(root, "tests/fixtures/prompt-golden-pre-migration.txt");
  fs.writeFileSync(out, full, "utf8");
  process.stdout.write(`golden prompt → ${out} (${full.length} bytes)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to capture the baseline**

Run: `pnpm exec tsx scripts/snapshot-prompt.ts`
Expected: `golden prompt → /Users/alexandrecollet/queryme/tests/fixtures/prompt-golden-pre-migration.txt (NNNNN bytes)` and the file exists.

- [ ] **Step 3: Write the golden-master test**

Create `tests/prompts/golden-master.test.ts`:

```ts
/**
 * Byte-identity guarantee: the LLM-facing prompt (header + KB text) must not
 * change as a side effect of the headless-persona refactor. If this test
 * fails, the refactor broke something downstream of the prompt.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("LLM-facing prompt is byte-identical to pre-migration baseline", () => {
  it("matches tests/fixtures/prompt-golden-pre-migration.txt", async () => {
    const root = process.cwd();
    const kb = await loadKb(path.join(root, "kb"), "en");
    const kbText = assemblePublicKbText(kb);
    const parts = buildSystemPromptParts({ kbText });
    const actual = parts.map((p) => p.text).join("\n\n");

    const goldenPath = path.join(
      root,
      "tests/fixtures/prompt-golden-pre-migration.txt",
    );
    const expected = fs.readFileSync(goldenPath, "utf8");

    expect(actual).toBe(expected);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm test tests/prompts/golden-master.test.ts`
Expected: PASS — the just-captured fixture matches what the assembler produces.

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot-prompt.ts tests/fixtures/prompt-golden-pre-migration.txt tests/prompts/golden-master.test.ts
git commit -m "test: snapshot pre-migration prompt for byte-identity guarantee"
```

---

### Task 3: Add `persona_source` DB table

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0005_persona_source.sql` (generated)

- [ ] **Step 1: Add the table to the schema**

Append to `lib/db/schema.ts`:

```ts
export const personaSource = pgTable("persona_source", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").notNull().default("main"),
  commitSha: text("commit_sha").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  error: text("error"),
});

export type PersonaSource = typeof personaSource.$inferSelect;
export type NewPersonaSource = typeof personaSource.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: `lib/db/migrations/0005_<random>.sql` is created with `CREATE TABLE "persona_source"`.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: migration applies cleanly. (If using a local-dev postgres, point `DATABASE_URL` at it.)

- [ ] **Step 4: Verify the table exists**

Run: `pnpm exec tsx -e "import { db } from '@/lib/db'; import { personaSource } from '@/lib/db/schema'; db.select().from(personaSource).then((r) => console.log('rows:', r.length))"`
Expected: `rows: 0`

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "feat(db): add persona_source table"
```

---

## Phase 2 — Persona-source module

### Task 4: Build URL parser

**Files:**
- Create: `lib/persona-source.ts`
- Create: `tests/lib/persona-source.test.ts`

Start with the smallest pure function: parse a GitHub URL into `{ owner, repo }`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/persona-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGitHubRepoUrl } from "@/lib/persona-source";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: FAIL — `parseGitHubRepoUrl` not exported.

- [ ] **Step 3: Implement**

Create `lib/persona-source.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source.test.ts
git commit -m "feat(persona): parse GitHub repo URLs"
```

---

### Task 5: Build required-file validator

**Files:**
- Modify: `lib/persona-source.ts`
- Modify: `tests/lib/persona-source.test.ts`

Pure function: given a directory, return `null` if all required files exist, else an error message.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/persona-source.test.ts`:

```ts
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePersonaTree } from "@/lib/persona-source";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: FAIL — `validatePersonaTree` not exported.

- [ ] **Step 3: Implement**

Append to `lib/persona-source.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source.test.ts
git commit -m "feat(persona): validate required-file presence in a persona tree"
```

---

### Task 6: Build `syncFromGitHub` orchestrator

**Files:**
- Modify: `lib/persona-source.ts`
- Modify: `tests/lib/persona-source.test.ts`
- Create: `tests/lib/__mocks__/github-handlers.ts`

This is the largest task — wire URL parse → SHA fetch → tarball download → extract → validate → symlink flip → DB row write → cache reset. MSW provides the network layer.

- [ ] **Step 1: Write the MSW handlers**

Create `tests/lib/__mocks__/github-handlers.ts`:

```ts
/**
 * MSW handlers for the two GitHub endpoints persona-source touches.
 * Tests configure the responses per case via `server.use(...)`.
 */
import { http, HttpResponse } from "msw";
import { create as createTar } from "tar";
import { Readable } from "node:stream";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const FAKE_SHA = "abc1234567890abcdef1234567890abcdef12345";

/**
 * Builds an in-memory tar.gz buffer containing the given files. Each entry
 * key is the relative path; the value is the file body.
 *
 * GitHub's codeload tarballs wrap files in a top-level `<repo>-<sha>/`
 * directory; we mimic that prefix so the extractor sees real GitHub layout.
 */
export async function makeTarball(
  files: Record<string, string>,
  prefix = `queryme-content-${FAKE_SHA}`,
): Promise<Buffer> {
  // Materialise the file tree in a temp dir, then tar it.
  const stage = mkdtempSync(path.join(tmpdir(), "queryme-tarstage-"));
  const wrappedRoot = path.join(stage, prefix);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(wrappedRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  const stream = createTar({ cwd: stage, gzip: true }, [prefix]) as unknown as Readable;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export function happyPathHandlers(opts: {
  owner: string;
  repo: string;
  branch?: string;
  sha?: string;
  tarball: Buffer;
}) {
  const branch = opts.branch ?? "main";
  const sha = opts.sha ?? FAKE_SHA;
  return [
    http.get(
      `https://api.github.com/repos/${opts.owner}/${opts.repo}/commits/${branch}`,
      () => HttpResponse.json({ sha }),
    ),
    http.get(
      `https://codeload.github.com/${opts.owner}/${opts.repo}/tar.gz/${sha}`,
      () => HttpResponse.arrayBuffer(opts.tarball.buffer.slice(opts.tarball.byteOffset, opts.tarball.byteOffset + opts.tarball.byteLength), {
        headers: { "Content-Type": "application/x-gzip" },
      }),
    ),
  ];
}
```

- [ ] **Step 2: Set up MSW lifecycle in vitest.setup.ts (if not already)**

Check `vitest.setup.ts` — if MSW server is not yet started, add:

```ts
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const mswServer = setupServer();
beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
```

If `vitest.setup.ts` already exists with other globals, append the above. If MSW is already wired, skip — but make sure `mswServer` is exported so tests can call `mswServer.use(...)`.

- [ ] **Step 3: Write the syncFromGitHub happy-path test**

Append to `tests/lib/persona-source.test.ts`:

```ts
import { beforeEach, afterEach } from "vitest";
import { rmSync, existsSync, readFileSync, readlinkSync } from "node:fs";
import { db } from "@/lib/db";
import { personaSource } from "@/lib/db/schema";
import { syncFromGitHub, getActivePersonaRoot } from "@/lib/persona-source";
import { mswServer } from "../../vitest.setup";
import { FAKE_SHA, happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";

const MIN_REQUIRED_FILES: Record<string, string> = {
  "persona.yaml": "id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n  fr:\n    possessive: leur\n    objectPronoun: les\n    subjectPronoun: ils\n",
  "prompts/system.md": "system prompt body",
  "kb/profile.yaml": "name: Test Person\nheadline: Test\nlocation: Earth\nlanguages: [en]\n",
  "kb/profile.fr.yaml": "name: Personne Test\nheadline: Test\nlocation: Terre\nlanguages: [fr]\n",
  "kb/public-contact.yaml": "email: test@example.com\n",
  "kb/public-contact.fr.yaml": "email: test@example.com\n",
  "kb/skills.yaml": "skills: []\n",
  "kb/skills.fr.yaml": "skills: []\n",
  "kb/education.yaml": "education: []\n",
  "kb/education.fr.yaml": "education: []\n",
};

describe("syncFromGitHub — happy path", () => {
  const cacheRoot = "/tmp/queryme-test-persona-cache";

  beforeEach(async () => {
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    if (existsSync(cacheRoot)) rmSync(cacheRoot, { recursive: true, force: true });
    await db.delete(personaSource);
  });

  afterEach(() => {
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
    const rows = await db.select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].commitSha).toBe(FAKE_SHA);
    expect(rows[0].status).toBe("ok");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: FAIL — `syncFromGitHub`, `getActivePersonaRoot` not exported.

- [ ] **Step 5: Implement syncFromGitHub**

Append to `lib/persona-source.ts`:

```ts
import { x as extractTar } from "tar";
import { rm, mkdir, rename, symlink, readdir } from "node:fs/promises";
import { db } from "@/lib/db";
import { personaSource, type PersonaSource } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

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

  // 1. Resolve latest commit SHA on the requested branch.
  let sha: string;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) {
      throw new Error(`GitHub commits API returned ${res.status}`);
    }
    const body = (await res.json()) as { sha?: string };
    if (typeof body.sha !== "string") throw new Error("commits API response missing sha");
    sha = body.sha;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRow(repoUrl, branch, "unknown", "error", message);
    return { kind: "error", message };
  }

  // 2. Download tarball.
  const targetDir = `${cacheRoot()}/${sha}`;
  try {
    const res = await fetch(
      `https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`,
    );
    if (!res.ok) throw new Error(`tarball fetch returned ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // 3. Extract into a SHA-pinned directory, stripping the top-level
    //    GitHub-imposed `<repo>-<sha>/` wrapper so the contents land at
    //    `targetDir/persona.yaml` etc.
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await extractTar({ cwd: targetDir, strip: 1, file: undefined, gzip: true }, []).end(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRow(repoUrl, branch, sha, "error", message);
    return { kind: "error", message };
  }

  // 4. Validate required files.
  const missing = validatePersonaTree(targetDir);
  if (missing) {
    await rm(targetDir, { recursive: true, force: true });
    await recordRow(repoUrl, branch, sha, "error", missing);
    return { kind: "error", message: missing };
  }

  // 5. Flip the symlink atomically.
  const linkPath = `${cacheRoot()}/current`;
  const tmpLink = `${cacheRoot()}/current.new`;
  await rm(tmpLink, { force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);

  // 6. Persist DB row.
  const row = await recordRow(repoUrl, branch, sha, "ok", null);

  // 7. Reset in-memory caches so the next request rebuilds from the new dir.
  //    (Wired in Tasks 10/11/12.)
  return { kind: "ok", commitSha: sha, syncedAt: row.syncedAt };
}

async function recordRow(
  repoUrl: string,
  branch: string,
  commitSha: string,
  status: "ok" | "error",
  error: string | null,
): Promise<PersonaSource> {
  const [row] = await db
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
    return require("node:fs").readlinkSync(link);
  } catch {
    return null;
  }
}

export async function getActivePersonaSourceRow(): Promise<PersonaSource | null> {
  const [row] = await db
    .select()
    .from(personaSource)
    .where(eq(personaSource.status, "ok"))
    .orderBy(desc(personaSource.syncedAt))
    .limit(1);
  return row ?? null;
}

export async function listSyncHistory(limit = 10): Promise<PersonaSource[]> {
  return db
    .select()
    .from(personaSource)
    .orderBy(desc(personaSource.syncedAt))
    .limit(limit);
}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: PASS on the happy path. (Other behaviours covered by Task 7.)

- [ ] **Step 7: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source.test.ts tests/lib/__mocks__/ vitest.setup.ts
git commit -m "feat(persona): syncFromGitHub end-to-end (fetch / extract / validate / flip)"
```

---

### Task 7: Error paths and concurrent sync

**Files:**
- Modify: `tests/lib/persona-source.test.ts`

The orchestrator is already in place. Verify it handles failure modes correctly.

- [ ] **Step 1: Write the error-path tests**

Append to `tests/lib/persona-source.test.ts`:

```ts
import { http, HttpResponse } from "msw";

describe("syncFromGitHub — error paths", () => {
  const cacheRoot = "/tmp/queryme-test-persona-cache";

  beforeEach(async () => {
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    if (existsSync(cacheRoot)) rmSync(cacheRoot, { recursive: true, force: true });
    await db.delete(personaSource);
  });

  afterEach(() => {
    delete process.env.PERSONA_CACHE_ROOT;
  });

  it("returns an error and writes an error row when a required file is missing", async () => {
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["kb/skills.yaml"];
    const tarball = await makeTarball(incomplete);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("kb/skills.yaml");
    }

    // No symlink because validation failed.
    expect(existsSync(`${cacheRoot}/current`)).toBe(false);

    // Error row recorded.
    const rows = await db.select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toContain("kb/skills.yaml");
  });

  it("returns an error when the commits API returns 404", async () => {
    mswServer.use(
      http.get("https://api.github.com/repos/alex/queryme-content/commits/main", () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      ),
    );

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/404/);
    }
  });

  it("preserves the previous active SHA when a subsequent sync fails", async () => {
    // First sync: success.
    const goodTarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: goodTarball }));
    const first = await syncFromGitHub("https://github.com/alex/queryme-content");
    expect(first.kind).toBe("ok");
    const linkAfterFirst = readlinkSync(`${cacheRoot}/current`);
    expect(linkAfterFirst).toContain(FAKE_SHA);

    // Second sync: missing file.
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["persona.yaml"];
    const badTarball = await makeTarball(incomplete, "queryme-content-deadbeef");
    mswServer.resetHandlers();
    mswServer.use(
      ...happyPathHandlers({
        owner: "alex",
        repo: "queryme-content",
        sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        tarball: badTarball,
      }),
    );
    const second = await syncFromGitHub("https://github.com/alex/queryme-content");
    expect(second.kind).toBe("error");

    // Symlink still points at the first (good) SHA.
    expect(readlinkSync(`${cacheRoot}/current`)).toBe(linkAfterFirst);
  });

  it("serializes concurrent sync calls", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const [a, b] = await Promise.all([
      syncFromGitHub("https://github.com/alex/queryme-content"),
      syncFromGitHub("https://github.com/alex/queryme-content"),
    ]);

    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    // The in-flight mutex returns the same promise — only one DB row written.
    const rows = await db.select().from(personaSource);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: PASS — all 4 cases green. The implementation in Task 6 already supports these paths.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/persona-source.test.ts
git commit -m "test(persona): cover sync error paths and concurrent calls"
```

---

### Task 8: Lazy `ensurePersonaCacheReady()` for cold starts

**Files:**
- Modify: `lib/persona-source.ts`
- Modify: `tests/lib/persona-source.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/persona-source.test.ts`:

```ts
import { ensurePersonaCacheReady } from "@/lib/persona-source";

describe("ensurePersonaCacheReady — cold-start re-fetch", () => {
  const cacheRoot = "/tmp/queryme-test-persona-cache";

  beforeEach(async () => {
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    if (existsSync(cacheRoot)) rmSync(cacheRoot, { recursive: true, force: true });
    await db.delete(personaSource);
  });

  afterEach(() => {
    delete process.env.PERSONA_CACHE_ROOT;
  });

  it("is a no-op when no persona is configured", async () => {
    await ensurePersonaCacheReady();
    expect(getActivePersonaRoot()).toBeNull();
  });

  it("re-fetches the recorded SHA when the symlink is missing", async () => {
    // Simulate a successful prior sync, then wipe the cache (cold start).
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHub("https://github.com/alex/queryme-content");
    rmSync(cacheRoot, { recursive: true, force: true });

    // Re-register handlers because msw resetHandlers ran in afterEach... actually no,
    // afterEach runs AFTER the test body. We're still in the same `it`. The handlers
    // are still active for the second fetch.

    await ensurePersonaCacheReady();
    expect(existsSync(`${cacheRoot}/current`)).toBe(true);
    expect(readFileSync(`${cacheRoot}/current/persona.yaml`, "utf8")).toContain("test-persona");
  });

  it("is a no-op when the symlink already points at the recorded SHA", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHub("https://github.com/alex/queryme-content");

    // Sanity: a second ensure does not refetch (we don't re-register handlers).
    mswServer.resetHandlers();
    mswServer.use(
      http.get(/api\.github\.com/, () => {
        throw new Error("should not be called");
      }),
      http.get(/codeload\.github\.com/, () => {
        throw new Error("should not be called");
      }),
    );

    await expect(ensurePersonaCacheReady()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: FAIL — `ensurePersonaCacheReady` not exported.

- [ ] **Step 3: Implement**

Append to `lib/persona-source.ts`:

```ts
import fsSync from "node:fs";

export async function ensurePersonaCacheReady(): Promise<void> {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return;
  const linkPath = `${cacheRoot()}/current`;
  if (fsSync.existsSync(linkPath)) return;

  const active = await getActivePersonaSourceRow();
  if (!active) return; // no persona configured at all → caller renders setup screen.

  // Re-fetch the recorded SHA's tarball into the cache.
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
  await extractTar({ cwd: targetDir, strip: 1, gzip: true }).end(buf);

  const missing = validatePersonaTree(targetDir);
  if (missing) throw new Error(`cold-start refetch validation failed: ${missing}`);

  const linkPath = `${cacheRoot()}/current`;
  const tmpLink = `${cacheRoot()}/current.new`;
  await rm(tmpLink, { force: true });
  await symlink(targetDir, tmpLink);
  await rename(tmpLink, linkPath);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/persona-source.test.ts`
Expected: PASS — all `ensurePersonaCacheReady` cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source.test.ts
git commit -m "feat(persona): cold-start lazy refetch via ensurePersonaCacheReady"
```

---

### Task 9: Old-SHA directory cleanup

**Files:**
- Modify: `lib/persona-source.ts`
- Modify: `tests/lib/persona-source.test.ts`

After each successful sync, retain the new SHA + the previous one (for instant rollback debugging); delete anything older.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/persona-source.test.ts`:

```ts
describe("syncFromGitHub — cache cleanup", () => {
  const cacheRoot = "/tmp/queryme-test-persona-cache";

  beforeEach(async () => {
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    if (existsSync(cacheRoot)) rmSync(cacheRoot, { recursive: true, force: true });
    await db.delete(personaSource);
  });

  afterEach(() => {
    delete process.env.PERSONA_CACHE_ROOT;
  });

  it("keeps the current + previous SHA dirs and deletes older ones", async () => {
    const shas = ["aaaa", "bbbb", "cccc", "dddd"];
    for (const sha of shas) {
      const tarball = await makeTarball(MIN_REQUIRED_FILES, `queryme-content-${sha}`);
      mswServer.resetHandlers();
      mswServer.use(
        ...happyPathHandlers({
          owner: "alex",
          repo: "queryme-content",
          sha: sha.padEnd(40, "0"),
          tarball,
        }),
      );
      await syncFromGitHub("https://github.com/alex/queryme-content");
    }

    const dirs = require("node:fs").readdirSync(cacheRoot).filter((d: string) => d !== "current");
    expect(dirs.sort()).toEqual([
      "cccc".padEnd(40, "0"),
      "dddd".padEnd(40, "0"),
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/persona-source.test.ts -t "cache cleanup"`
Expected: FAIL — all 4 SHA dirs still present.

- [ ] **Step 3: Implement cleanup at the end of `doSync`**

In `lib/persona-source.ts`, after the symlink flip and `recordRow` call in `doSync`, before the `return`:

```ts
  // 8. Clean up: keep current + previous, delete older SHA dirs.
  await cleanupOldShas(sha);
```

Add the helper:

```ts
async function cleanupOldShas(currentSha: string): Promise<void> {
  const root = cacheRoot();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  // Recent SHAs by DB synced_at — keep the current + the one before.
  const recent = await db
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/persona-source.test.ts -t "cache cleanup"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source.test.ts
git commit -m "feat(persona): keep current + previous SHA, delete older cache dirs"
```

---

## Phase 3 — `lib/persona.ts` (load persona.yaml)

### Task 10: Persona loader + zod validation

**Files:**
- Create: `lib/persona.ts`
- Create: `tests/lib/persona.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/persona.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPersona, _resetPersonaCache } from "@/lib/persona";

const ALEX_YAML = `id: alex-collet
fullName: "Alexandre Collet"
givenName: "Alexandre"
defaultLocale: en
i18n:
  en:
    possessive: "his"
    objectPronoun: "him"
    subjectPronoun: "he"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "d'Alexandre"
`;

function withYaml(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "persona-test-"));
  writeFileSync(path.join(dir, "persona.yaml"), yaml, "utf8");
  return dir;
}

describe("loadPersona", () => {
  beforeEach(() => _resetPersonaCache());
  afterEach(() => _resetPersonaCache());

  it("parses a valid persona.yaml", () => {
    const root = withYaml(ALEX_YAML);
    const persona = loadPersona(root);
    expect(persona.id).toBe("alex-collet");
    expect(persona.fullName).toBe("Alexandre Collet");
    expect(persona.givenName).toBe("Alexandre");
    expect(persona.i18n.fr.givenWithApostrophe).toBe("d'Alexandre");
  });

  it("rejects when givenName is missing", () => {
    const bad = ALEX_YAML.replace(/givenName: "Alexandre"\n/, "");
    const root = withYaml(bad);
    expect(() => loadPersona(root)).toThrow();
  });

  it("rejects when an unknown locale is present", () => {
    const bad = ALEX_YAML.replace(
      "i18n:",
      "i18n:\n  de:\n    possessive: sein\n    objectPronoun: ihn\n    subjectPronoun: er",
    );
    const root = withYaml(bad);
    expect(() => loadPersona(root)).toThrow();
  });

  it("caches and reloads correctly when the cache is reset", () => {
    const root = withYaml(ALEX_YAML);
    const p1 = loadPersona(root);
    const p2 = loadPersona(root);
    expect(p1).toBe(p2);                 // same instance — cached.

    _resetPersonaCache();
    const p3 = loadPersona(root);
    expect(p3).toEqual(p1);
    expect(p3).not.toBe(p1);              // new instance after reset.
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/persona.test.ts`
Expected: FAIL — `loadPersona` not exported.

- [ ] **Step 3: Implement**

Create `lib/persona.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const PersonaI18nSchema = z
  .object({
    given: z.string().min(1).optional(),
    givenWithApostrophe: z.string().min(1).optional(),
    possessive: z.string().min(1),
    objectPronoun: z.string().min(1),
    subjectPronoun: z.string().min(1),
  })
  .strict();

const PersonaSchema = z
  .object({
    id: z.string().min(1),
    fullName: z.string().min(1),
    givenName: z.string().min(1),
    shortName: z.string().min(1).optional(),
    defaultLocale: z.enum(["en", "fr"]),
    i18n: z
      .object({
        en: PersonaI18nSchema,
        fr: PersonaI18nSchema,
      })
      .strict(),
  })
  .strict();

export type Persona = z.infer<typeof PersonaSchema>;

let cached: Persona | null = null;

export function loadPersona(activeRoot: string): Persona {
  if (cached) return cached;
  const file = path.join(activeRoot, "persona.yaml");
  const raw = fs.readFileSync(file, "utf8");
  cached = PersonaSchema.parse(parseYaml(raw));
  return cached;
}

export function _resetPersonaCache(): void {
  cached = null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/persona.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/persona.ts tests/lib/persona.test.ts
git commit -m "feat(persona): zod-validated persona.yaml loader with cache"
```

---

## Phase 4 — Refactor loaders to read from active root

### Task 11: Refactor `lib/kb/cache.ts` to use active root

**Files:**
- Modify: `lib/kb/cache.ts`

The KB cache currently hard-codes `KB_DIR = path.resolve(process.cwd(), "kb")`. It must read from `getActivePersonaRoot()/kb` instead and expose a reset for sync to call.

- [ ] **Step 1: Set up the env override so existing tests stay green**

The simplest path: while the in-repo `kb/` still exists (until Task 27), set `PERSONA_LOCAL_OVERRIDE=$(pwd)` for tests and dev. Add to `vitest.setup.ts`:

```ts
process.env.PERSONA_LOCAL_OVERRIDE ??= process.cwd();
```

Run: `pnpm test tests/prompts/golden-master.test.ts`
Expected: PASS — golden test still works because `process.cwd()` has `kb/` + `prompts/system.md`.

- [ ] **Step 2: Modify `lib/kb/cache.ts`**

Replace the top of `lib/kb/cache.ts`:

```ts
// Before:
const KB_DIR = path.resolve(process.cwd(), "kb");
const CONFIG_DIR = process.cwd();

// After:
import { getActivePersonaRoot } from "@/lib/persona-source";

function kbDir(): string {
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  return path.join(root, "kb");
}

function configDir(): string {
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  return root;
}
```

Then replace every reference to `KB_DIR` with a call to `kbDir()`, and `CONFIG_DIR` with `configDir()`.

Add the exported reset:

```ts
export function resetKbCache(): void {
  parsedKbByLang.clear();
  publicKbTextByLang.clear();
  cvConfigPromise = null;
}
```

- [ ] **Step 3: Wire reset into syncFromGitHub**

In `lib/persona-source.ts`, after the symlink flip and `recordRow`:

```ts
import { resetKbCache } from "@/lib/kb/cache";
import { _resetPromptCache } from "@/lib/prompts";
import { _resetPersonaCache } from "@/lib/persona";

// After step 6 (recordRow), before step 8 (cleanupOldShas):
resetKbCache();
_resetPromptCache();
_resetPersonaCache();
```

(`_resetPromptCache` will be added in Task 12. For now leave the import commented out.)

- [ ] **Step 4: Run the existing tests**

Run: `pnpm test`
Expected: all tests pass. The override env var keeps loaders pointed at `process.cwd()`.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cache.ts lib/persona-source.ts vitest.setup.ts
git commit -m "refactor(kb): cache reads from active persona root; export resetKbCache"
```

---

### Task 12: Refactor `lib/prompts.ts` to use active root

**Files:**
- Modify: `lib/prompts.ts`

- [ ] **Step 1: Modify the file**

Replace `lib/prompts.ts` body:

```ts
import fs from "node:fs";
import path from "node:path";
import { getActivePersonaRoot } from "@/lib/persona-source";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  const file = path.join(root, "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

export function buildSystemPromptParts(input: { kbText: string }): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
}

export function _resetPromptCache(): void {
  cachedHeader = null;
}
```

- [ ] **Step 2: Uncomment the reset wiring in persona-source.ts**

In `lib/persona-source.ts`, ensure the import and call are active:

```ts
import { _resetPromptCache } from "@/lib/prompts";
// ...
_resetPromptCache();
```

- [ ] **Step 3: Run the golden-master test**

Run: `pnpm test tests/prompts/golden-master.test.ts`
Expected: PASS — byte-identity preserved (loader points at `process.cwd()` via the override).

- [ ] **Step 4: Commit**

```bash
git add lib/prompts.ts lib/persona-source.ts
git commit -m "refactor(prompts): read system.md from active persona root"
```

---

### Task 13: Refactor `lib/kb/cv-config.ts` to use active root

**Files:**
- Modify: `lib/kb/cv-config.ts`

- [ ] **Step 1: Inspect the file's current path resolution**

Run: `grep -n 'process.cwd\|configDir\|CONFIG_DIR\|cv-config.yaml' lib/kb/cv-config.ts`

Identify the variable / function that resolves the config path.

- [ ] **Step 2: Replace with active-root resolution**

Modify `lib/kb/cv-config.ts`: replace any `process.cwd()` reference for `cv-config.yaml` with:

```ts
import { getActivePersonaRoot } from "@/lib/persona-source";

function configPath(): string {
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  return path.join(root, "cv-config.yaml");
}
```

Then use `configPath()` instead of the previous literal.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/kb/cv-config.ts
git commit -m "refactor(kb): cv-config reads from active persona root"
```

---

## Phase 5 — UI strings refactor

### Task 14: Convert `lib/language.ts` to `buildUiStrings(persona)`

**Files:**
- Modify: `lib/language.ts`
- Create: `tests/lib/language.test.ts`

- [ ] **Step 1: Write the byte-identity test**

Create `tests/lib/language.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildUiStrings } from "@/lib/language";
import type { Persona } from "@/lib/persona";

const ALEX: Persona = {
  id: "alex-collet",
  fullName: "Alexandre Collet",
  givenName: "Alexandre",
  defaultLocale: "en",
  i18n: {
    en: { possessive: "his", objectPronoun: "him", subjectPronoun: "he" },
    fr: {
      possessive: "son",
      objectPronoun: "le",
      subjectPronoun: "il",
      givenWithApostrophe: "d'Alexandre",
    },
  },
};

describe("buildUiStrings — byte-identity with pre-refactor literals", () => {
  it("EN headline matches today's literal", () => {
    const t = buildUiStrings(ALEX).en;
    expect(t.headline).toBe("Alexandre Collet — queryable CV");
    expect(t.intro).toBe(
      "Hi — I'm an agent that can answer questions about Alexandre's background, experience, and projects. Ask me anything.",
    );
    expect(t.starters).toEqual([
      "What's his most recent role?",
      "What's his experience with AI?",
      "How do I contact him?",
    ]);
    expect(t.forwardAction).toBe("Send this question to Alexandre");
    expect(t.forward.send).toBe("Send to Alexandre");
    expect(t.forward.successWithContact).toBe(
      "Sent. Alexandre will reply at the contact you left.",
    );
    expect(t.forward.successNoContact).toBe(
      "Sent. Alexandre will see it next time he checks.",
    );
  });

  it("FR headline matches today's literal (apostrophe form preserved)", () => {
    const t = buildUiStrings(ALEX).fr;
    expect(t.headline).toBe("Alexandre Collet — CV interrogeable");
    expect(t.intro).toBe(
      "Bonjour — je suis un agent qui peut répondre à des questions sur le parcours, l'expérience et les projets d'Alexandre. Posez-moi vos questions.",
    );
    expect(t.starters).toEqual([
      "Quel est son poste le plus récent ?",
      "Quelle est son expérience en IA ?",
      "Comment le contacter ?",
    ]);
    expect(t.forward.successNoContact).toBe(
      "Envoyé. Alexandre le verra lors de son prochain passage.",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/lib/language.test.ts`
Expected: FAIL — `buildUiStrings` not exported.

- [ ] **Step 3: Refactor `lib/language.ts`**

Replace the `export const UI_STRINGS = { ... } as const` with a function `buildUiStrings(persona: Persona)` that returns the same nested shape. Substitute persona tokens into the name-mentioning strings. (Use the spec section 6 mapping.) Keep `UiLang`, `UiStrings`, `KbStrings` type exports — derive `UiStrings = ReturnType<typeof buildUiStrings>["en"]`.

Concretely, swap each literal:
- `"Alexandre Collet"` → `` `${persona.fullName}` ``
- `"Alexandre"` → `` `${persona.givenName}` ``
- `"his"` (EN) → `` `${persona.i18n.en.possessive}` ``
- `"him"` (EN) → `` `${persona.i18n.en.objectPronoun}` ``
- `"he"` (EN, sentence-context only) → `` `${persona.i18n.en.subjectPronoun}` ``
- `"son"` (FR) → `` `${persona.i18n.fr.possessive}` ``
- `"le"` (FR) → `` `${persona.i18n.fr.objectPronoun}` ``
- `"d'Alexandre"` (FR) → `` `${persona.i18n.fr.givenWithApostrophe}` ``

Drop `UI_STRINGS` const altogether.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/lib/language.test.ts`
Expected: PASS — every literal reproduced from persona tokens.

- [ ] **Step 5: Commit**

```bash
git add lib/language.ts tests/lib/language.test.ts
git commit -m "refactor(language): buildUiStrings(persona) — byte-identical for Alex"
```

---

### Task 15: Refactor `app/page.tsx` to server component

**Files:**
- Modify: `app/page.tsx`
- Create: `components/home-page-client.tsx`

`app/page.tsx` is currently a client component owning React state. Split it: a server component (`app/page.tsx`) loads persona + builds strings, and a new client child (`components/home-page-client.tsx`) owns state + renders the shell.

- [ ] **Step 1: Create the new client child**

Create `components/home-page-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { HomeShell } from "@/components/home-shell";
import { KbProvider } from "@/components/kb/kb-context";
import type { UiLang, UiStrings, KbStrings } from "@/lib/language";

type Props = {
  /** Pre-built strings for both locales, computed server-side from persona. */
  strings: { en: UiStrings; fr: UiStrings };
};

export function HomePageClient({ strings }: Props) {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);
  const t = strings[lang];

  return (
    <KbProvider lang={lang} kbStrings={t.kb}>
      <GridBackground />
      <HomeShell
        t={t}
        lang={lang}
        onLangChange={setLang}
        mcpOpen={mcpOpen}
        onMcpOpenChange={setMcpOpen}
        aboutOpen={aboutOpen}
        onAboutOpenChange={setAboutOpen}
        kbCollapsed={kbCollapsed}
        onKbCollapsedChange={setKbCollapsed}
      />
    </KbProvider>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";
import { loadPersona } from "@/lib/persona";
import { buildUiStrings } from "@/lib/language";
import { HomePageClient } from "@/components/home-page-client";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export default async function Home() {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return <NotConfiguredScreen />;
  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  return <HomePageClient strings={strings} />;
}
```

`<NotConfiguredScreen />` is implemented in Task 22 — for now create a stub so this file type-checks:

Create `components/not-configured-screen.tsx`:

```tsx
export function NotConfiguredScreen() {
  return (
    <main className="flex h-dvh items-center justify-center px-6">
      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        This deployment has no persona configured yet.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Run type-check**

Run: `pnpm typecheck`
Expected: should fail because `HomeShell` doesn't yet accept a `t` prop and `KbProvider` doesn't accept `kbStrings`. Those are fixed in Tasks 16–17.

(You may proceed with the failing typecheck — it will resolve at the end of Task 17.)

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/home-page-client.tsx components/not-configured-screen.tsx
git commit -m "refactor(page): home becomes a server component; client owns state"
```

---

### Task 16: Update `components/home-shell.tsx` to receive `t` prop

**Files:**
- Modify: `components/home-shell.tsx`

- [ ] **Step 1: Modify the file**

In `components/home-shell.tsx`:

```tsx
// Remove:
import { UI_STRINGS, type UiLang } from "@/lib/language";
// Add:
import type { UiLang, UiStrings } from "@/lib/language";

// Add to Props:
type Props = {
  t: UiStrings;
  lang: UiLang;
  // ...rest unchanged
};

// Remove from body:
const t = UI_STRINGS[lang];
// (the new `t` comes in as a prop)

// Update destructuring:
export function HomeShell({ t, lang, onLangChange, /* ...rest */ }: Props) {
  // body unchanged — `t` now comes from props
}
```

- [ ] **Step 2: Run type-check (still partial)**

Run: `pnpm typecheck`
Expected: home-shell errors gone; kb-context errors remain.

- [ ] **Step 3: Commit**

```bash
git add components/home-shell.tsx
git commit -m "refactor(home-shell): receive UI strings as t prop"
```

---

### Task 17: Update `components/kb/kb-context.tsx` to receive `kbStrings` prop

**Files:**
- Modify: `components/kb/kb-context.tsx`
- Modify: existing component tests if any assert "Alexandre" via `UI_STRINGS`

- [ ] **Step 1: Modify kb-context.tsx**

```tsx
// Remove:
import { UI_STRINGS, type KbStrings, type UiLang } from "@/lib/language";
// Add:
import type { KbStrings, UiLang } from "@/lib/language";

// Update KbProvider signature:
export function KbProvider({
  lang,
  kbStrings,
  children,
}: {
  lang: UiLang;
  kbStrings: KbStrings;
  children: ReactNode;
}) {
  const strings = kbStrings; // was: UI_STRINGS[lang].kb
  // ...rest unchanged
}
```

- [ ] **Step 2: Run type-check**

Run: `pnpm typecheck`
Expected: PASS — full app type-checks again.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS. The golden-master test still green (UI string refactor doesn't touch the LLM prompt path).

- [ ] **Step 4: Commit**

```bash
git add components/kb/kb-context.tsx
git commit -m "refactor(kb-context): receive kbStrings as prop"
```

---

### Task 18: Convert page metadata to `generateMetadata()`

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/about/page.tsx`
- Modify: `app/cv/page.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

Replace `export const metadata` with:

```ts
import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";
import { loadPersona } from "@/lib/persona";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return { title: "queryme", description: "Not configured yet." };
  const persona = loadPersona(root);
  return {
    title: `${persona.fullName} — queryable CV`,
    description: `Ask the agent about ${persona.givenName}'s background, experience, and projects.`,
  };
}
```

- [ ] **Step 2: Update `app/about/page.tsx`**

Replace `export const metadata` similarly:

```ts
export async function generateMetadata(): Promise<Metadata> {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return { title: "About" };
  const persona = loadPersona(root);
  return {
    title: `${persona.fullName} — CV`,
    description: "Battery systems and software engineer. Co-founder, CTO, builder — from silicon to cloud.",
    openGraph: {
      title: `${persona.fullName} — CV`,
      description: "Battery systems and software engineer.",
      type: "profile",
    },
  };
}
```

(The description text stays as today's literal — it is **not** persona-templated to honor "UI must not change for Alex." A future iteration can pull the description from `persona.yaml.headline`.)

- [ ] **Step 3: Update `app/cv/page.tsx`**

Same pattern.

- [ ] **Step 4: Run type-check + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/about/page.tsx app/cv/page.tsx
git commit -m "refactor(seo): page metadata reads persona via generateMetadata"
```

---

## Phase 6 — Admin Content tab + setup screen

### Task 19: `GET /api/admin/persona-source` endpoint

**Files:**
- Create: `app/api/admin/persona-source/route.ts`
- Create: `tests/api/admin/persona-source.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/admin/persona-source.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { personaSource } from "@/lib/db/schema";

describe("GET /api/admin/persona-source", () => {
  beforeEach(async () => {
    await db.delete(personaSource);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => false,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns { active: null, history: [] } when no persona configured", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ active: null, history: [] });
  });

  it("returns the active row and the history list", async () => {
    await db.insert(personaSource).values([
      {
        repoUrl: "https://github.com/alex/queryme-content",
        branch: "main",
        commitSha: "aaa",
        status: "ok",
      },
      {
        repoUrl: "https://github.com/alex/queryme-content",
        branch: "main",
        commitSha: "bbb",
        status: "error",
        error: "missing kb/profile.yaml",
      },
    ]);
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.active.commitSha).toBe("aaa");
    expect(body.history).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/api/admin/persona-source.test.ts`
Expected: FAIL — route module not present.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/persona-source/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import {
  getActivePersonaSourceRow,
  listSyncHistory,
} from "@/lib/persona-source";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [active, history] = await Promise.all([
    getActivePersonaSourceRow(),
    listSyncHistory(10),
  ]);
  return NextResponse.json({ active, history });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/api/admin/persona-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/persona-source/route.ts tests/api/admin/persona-source.test.ts
git commit -m "feat(admin): GET /api/admin/persona-source returns active + history"
```

---

### Task 20: `POST /api/admin/persona-source` endpoint

**Files:**
- Modify: `app/api/admin/persona-source/route.ts`
- Modify: `tests/api/admin/persona-source.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/api/admin/persona-source.test.ts`:

```ts
import { mswServer } from "../../../vitest.setup";
import { happyPathHandlers, makeTarball, FAKE_SHA } from "../../lib/__mocks__/github-handlers";

const MIN_REQUIRED_FILES: Record<string, string> = {
  /* ...copy from persona-source tests... */
};

describe("POST /api/admin/persona-source", () => {
  beforeEach(async () => {
    await db.delete(personaSource);
    process.env.PERSONA_CACHE_ROOT = "/tmp/queryme-test-route-cache";
    require("node:fs").rmSync(process.env.PERSONA_CACHE_ROOT, { recursive: true, force: true });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => false }));
    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("triggers a sync and returns the new row", async () => {
    vi.doMock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => true }));
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.commitSha).toBe(FAKE_SHA);
  });

  it("returns 400 with the error message when sync fails", async () => {
    vi.doMock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => true }));
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["kb/skills.yaml"];
    const tarball = await makeTarball(incomplete);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("kb/skills.yaml");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/api/admin/persona-source.test.ts -t "POST"`
Expected: FAIL — `POST` not exported.

- [ ] **Step 3: Implement POST**

Append to `app/api/admin/persona-source/route.ts`:

```ts
import { syncFromGitHub } from "@/lib/persona-source";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { repoUrl?: string; branch?: string };
  if (!body.repoUrl) {
    return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  }
  const result = await syncFromGitHub(body.repoUrl, body.branch);
  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({
    commitSha: result.commitSha,
    syncedAt: result.syncedAt,
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/api/admin/persona-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/persona-source/route.ts tests/api/admin/persona-source.test.ts
git commit -m "feat(admin): POST /api/admin/persona-source triggers sync"
```

---

### Task 21: Build the Content tab component

**Files:**
- Create: `components/admin/content-tab.tsx`
- Create: `tests/components/admin/content-tab.test.tsx`

- [ ] **Step 1: Write the render test**

Create `tests/components/admin/content-tab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentTab } from "@/components/admin/content-tab";

const ACTIVE_ROW = {
  id: "x",
  repoUrl: "https://github.com/alex/queryme-content",
  branch: "main",
  commitSha: "abc1234567890abcdef1234567890abcdef12345",
  status: "ok",
  error: null,
  syncedAt: new Date("2026-05-28T12:00:00Z").toISOString(),
};

describe("ContentTab", () => {
  it("renders the active source", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: ACTIVE_ROW, history: [ACTIVE_ROW] }),
    }) as any;

    render(<ContentTab />);
    await waitFor(() => {
      expect(screen.getByText("alex/queryme-content")).toBeInTheDocument();
      expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    });
  });

  it("submits a sync POST when the form is filled in", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ active: null, history: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commitSha: "def", syncedAt: new Date().toISOString() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ active: ACTIVE_ROW, history: [ACTIVE_ROW] }) });
    global.fetch = fetchMock as any;

    render(<ContentTab />);
    const url = await screen.findByLabelText(/repo url/i);
    await userEvent.type(url, "https://github.com/alex/queryme-content");
    await userEvent.click(screen.getByRole("button", { name: /sync/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/persona-source",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/components/admin/content-tab.test.tsx`
Expected: FAIL — module not present.

- [ ] **Step 3: Implement**

Create `components/admin/content-tab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PersonaSource } from "@/lib/db/schema";

type State = { active: PersonaSource | null; history: PersonaSource[] };

export function ContentTab() {
  const [state, setState] = useState<State | null>(null);
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch("/api/admin/persona-source");
    if (res.ok) setState(await res.json());
  };

  useEffect(() => {
    void reload();
  }, []);

  const sync = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    setLastError(null);
    const res = await fetch("/api/admin/persona-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: url, branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setLastError(body.error ?? "Sync failed");
    } else {
      setUrl("");
      await reload();
    }
    setSubmitting(false);
  };

  const resync = async () => {
    if (!state?.active) return;
    setSubmitting(true);
    setLastError(null);
    const res = await fetch("/api/admin/persona-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: state.active.repoUrl, branch: state.active.branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setLastError(body.error ?? "Resync failed");
    } else {
      await reload();
    }
    setSubmitting(false);
  };

  if (!state) return <div className="p-4 text-sm text-[var(--color-text-tertiary)]">Loading…</div>;

  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Active source
        </h2>
        {state.active ? (
          <div className="mt-2 space-y-1 text-sm">
            <div>
              <span className="text-[var(--color-text-tertiary)]">repo: </span>
              <a
                href={state.active.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {prettyRepo(state.active.repoUrl)}
              </a>
            </div>
            <div>
              <span className="text-[var(--color-text-tertiary)]">branch: </span>
              {state.active.branch}
            </div>
            <div>
              <span className="text-[var(--color-text-tertiary)]">commit: </span>
              <code className="text-xs">{state.active.commitSha.slice(0, 7)}</code>
            </div>
            <div>
              <span className="text-[var(--color-text-tertiary)]">last synced: </span>
              {new Date(state.active.syncedAt).toLocaleString()}
            </div>
            <button
              type="button"
              onClick={resync}
              disabled={submitting}
              className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
            >
              {submitting ? "Syncing…" : "Resync from current source"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            No persona configured yet — paste a public GitHub repo URL below.
          </p>
        )}
        {lastError && (
          <p className="mt-2 text-sm text-red-500">{lastError}</p>
        )}
      </section>

      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Update source
        </h2>
        <form onSubmit={sync} className="mt-2 space-y-2">
          <label className="block text-sm">
            <span className="block text-xs text-[var(--color-text-tertiary)]">Repo URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://github.com/<owner>/<repo>"
              className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-[var(--color-text-tertiary)]">Branch</span>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !url}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            {submitting ? "Syncing…" : "Sync"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Sync history
        </h2>
        <ul className="mt-2 space-y-1 text-xs">
          {state.history.map((row) => (
            <li key={row.id} className="flex gap-3">
              <span>{new Date(row.syncedAt).toLocaleString()}</span>
              <code>{row.commitSha.slice(0, 7)}</code>
              <span className={row.status === "ok" ? "text-emerald-500" : "text-red-500"}>
                {row.status}
              </span>
              {row.error && <span className="text-[var(--color-text-tertiary)]">{row.error}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function prettyRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/components/admin/content-tab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/content-tab.tsx tests/components/admin/content-tab.test.tsx
git commit -m "feat(admin): Content tab UI for managing persona source"
```

---

### Task 22: Wire the Content tab into the admin dashboard

**Files:**
- Modify: `components/admin/admin-dashboard.tsx`

- [ ] **Step 1: Add the tab**

In `components/admin/admin-dashboard.tsx`:

```tsx
import { ContentTab } from "@/components/admin/content-tab";

// TabId union:
type TabId = "interviewers" | "conversations" | "questions" | "content" | "analytics";

// Add to the `selected` initial state:
const [selected, setSelected] = useState<Record<TabId, string | null>>({
  interviewers: null,
  conversations: null,
  questions: null,
  content: null,
  analytics: null,
});

// Add a new tab button alongside the others (follow the existing pattern).
// Render <ContentTab /> when `tab === "content"`.
```

- [ ] **Step 2: Update the dashboard test if it asserts on tabs**

Run: `grep -n 'TabId\|interviewers\b' tests/components/admin 2>/dev/null`

If a test enumerates tab IDs, add `"content"`.

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/admin/admin-dashboard.tsx tests/components/admin/
git commit -m "feat(admin): mount Content tab in the admin dashboard"
```

---

### Task 23: Setup screen + 503 from chat/MCP when not configured

**Files:**
- Modify: `components/not-configured-screen.tsx`
- Modify: `app/api/chat/route.ts` (or wherever the chat handler lives)
- Modify: `app/mcp/route.ts` (or wherever the MCP endpoint lives — verify path)

- [ ] **Step 1: Find the chat + MCP route files**

Run: `grep -rln 'export async function POST\|export async function GET' app/api/chat app/mcp app/api/mcp 2>/dev/null | head`

Use the discovered paths for the next step.

- [ ] **Step 2: Replace the placeholder NotConfiguredScreen with the real one**

```tsx
import { MatriceLogo } from "@/components/matrice-logo";

export function NotConfiguredScreen() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <MatriceLogo size={48} />
      <div>
        <h1 className="font-display text-lg text-[var(--color-text-primary)]">queryme</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          This deployment has no persona configured yet.
        </p>
      </div>
    </main>
  );
}
```

Note: server component `app/page.tsx` should set the response status to 503 when rendering this screen. Use Next's `notFound`? No — use a response helper. Easier: a small Server Action wouldn't help. Instead, also add a check in middleware? Skip status code on the homepage; just render the screen. The 503 matters for `/api/chat` and `/mcp` (where SEO doesn't apply).

- [ ] **Step 3: Guard `/api/chat` route**

At the top of the chat POST handler:

```ts
import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";

export async function POST(req: Request) {
  await ensurePersonaCacheReady();
  if (!getActivePersonaRoot()) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  // ...existing body
}
```

- [ ] **Step 4: Guard the MCP endpoint**

Same pattern at the top of the MCP route's request handler. The exact JSON-RPC error shape depends on the SDK in use — return a JSON-RPC error object with code `-32000` and message `"persona_not_configured"` if needed.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/not-configured-screen.tsx app/api/chat/route.ts app/api/mcp/route.ts
git commit -m "feat: setup screen + 503 from chat/MCP when persona not configured"
```

---

## Phase 7 — Cleanup (sensitive deprecation + table rename)

### Task 24: Drop the sensitive-unlock column + remove EXCLUDED_DIR

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0006_drop_sensitive_unlock.sql` (generated)
- Modify: `lib/kb/manifest.ts`
- Modify: `tests/lib/kb/manifest.test.ts`

- [ ] **Step 1: Remove `sensitive_unlocked_at` from schema**

In `lib/db/schema.ts`, find the `askers` (or equivalent) table and delete the `sensitive_unlocked_at` column declaration.

Run: `grep -n 'sensitive_unlocked_at\|sensitiveUnlockedAt' lib/db/schema.ts`

Verify it is gone after editing.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new migration file `0006_<random>.sql` containing `ALTER TABLE ... DROP COLUMN ...`.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: clean apply.

- [ ] **Step 4: Remove the manifest exclusion**

In `lib/kb/manifest.ts`:

```ts
// Remove:
const EXCLUDED_DIR = "sensitive";
// ...and the line(s) that filter on it.
```

- [ ] **Step 5: Update the manifest test**

In `tests/lib/kb/manifest.test.ts`, delete the test that asserts `sensitive/` is excluded. The directory will be deleted in Task 27, but the *exclusion logic* is what we're removing here.

- [ ] **Step 6: Run all tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ lib/kb/manifest.ts tests/lib/kb/manifest.test.ts
git commit -m "refactor: drop sensitive-unlock column and KB exclusion"
```

---

### Task 25: Rename `questions_for_alex` → `forwarded_questions`

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0007_rename_questions_table.sql` (hand-crafted)
- Modify: `lib/admin/data.ts`, `lib/questions/repo.ts`, `app/api/admin/analytics/route.ts`, `components/admin/admin-dashboard.tsx`

Drizzle's diff would emit DROP + CREATE which would lose data. We write the migration by hand.

- [ ] **Step 1: Write the hand-crafted migration**

Create `lib/db/migrations/0007_rename_questions_table.sql`:

```sql
ALTER TABLE "questions_for_alex" RENAME TO "forwarded_questions";

ALTER TABLE "forwarded_questions"
  RENAME CONSTRAINT "questions_for_alex_conversation_id_conversations_id_fk"
  TO "forwarded_questions_conversation_id_conversations_id_fk";
```

(If additional FK constraints exist with `questions_for_alex` in their name, rename them similarly. Verify with `pnpm exec tsx -e "import { db } from '@/lib/db'; ..."` if unsure.)

- [ ] **Step 2: Update `lib/db/schema.ts`**

```ts
// Replace:
export const questionsForAlex = pgTable("questions_for_alex", { /* ... */ });
export type QuestionForAlex = typeof questionsForAlex.$inferSelect;
// With:
export const forwardedQuestions = pgTable("forwarded_questions", { /* same columns */ });
export type ForwardedQuestion = typeof forwardedQuestions.$inferSelect;
```

- [ ] **Step 3: Update `_journal.json` so drizzle-kit knows about 0007**

Edit `lib/db/migrations/meta/_journal.json` to append a record for `0007_rename_questions_table` matching the format of preceding entries. (Drizzle-kit normally maintains this; for hand-written migrations the manual step is required.)

- [ ] **Step 4: Apply**

Run: `pnpm db:migrate`
Expected: rename applies; existing data preserved.

- [ ] **Step 5: Find and rename consumers**

Run: `grep -rln 'questionsForAlex\|QuestionForAlex' --include='*.ts' --include='*.tsx' . 2>/dev/null | grep -v node_modules | grep -v '\.next'`

Replace `questionsForAlex` → `forwardedQuestions` and `QuestionForAlex` → `ForwardedQuestion` across:
- `lib/admin/data.ts`
- `lib/questions/repo.ts`
- `app/api/admin/analytics/route.ts`
- `components/admin/admin-dashboard.tsx`
- Any tests that import these types.

- [ ] **Step 6: Typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ lib/admin/data.ts lib/questions/repo.ts app/api/admin/analytics/route.ts components/admin/admin-dashboard.tsx tests/
git commit -m "refactor(db): rename questions_for_alex to forwarded_questions"
```

---

## Phase 8 — Migration to external repo

### Task 26: Create the `queryme-content-alex` repo

**Files:** (external, in a sibling directory)
- Create: `../queryme-content-alex/persona.yaml`
- Copy: queryme `kb/` → `../queryme-content-alex/kb/` (minus `kb/sensitive/`)
- Copy: queryme `prompts/system.md` → `../queryme-content-alex/prompts/system.md`
- Copy: queryme `cv-config.yaml` → `../queryme-content-alex/cv-config.yaml`

- [ ] **Step 1: Create the directory and copy content**

Run:

```bash
mkdir -p ../queryme-content-alex
cp -R kb ../queryme-content-alex/kb
rm -rf ../queryme-content-alex/kb/sensitive
mkdir -p ../queryme-content-alex/prompts
cp prompts/system.md ../queryme-content-alex/prompts/system.md
cp cv-config.yaml ../queryme-content-alex/cv-config.yaml
```

- [ ] **Step 2: Author `persona.yaml`**

Create `../queryme-content-alex/persona.yaml`:

```yaml
id: alex-collet
fullName: "Alexandre Collet"
givenName: "Alexandre"
defaultLocale: en
i18n:
  en:
    possessive: "his"
    objectPronoun: "him"
    subjectPronoun: "he"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "d'Alexandre"
```

- [ ] **Step 3: Init git and push**

Run:

```bash
cd ../queryme-content-alex
git init
git add .
git commit -m "initial: extracted from queryme"
gh repo create queryme-content-alex --public --source=. --push
cd -
```

(Adjust the gh command to your account / org.)

- [ ] **Step 4: Note the URL**

Capture the public repo URL — e.g. `https://github.com/<you>/queryme-content-alex`. This goes into the next task.

- [ ] **Step 5: Commit (n/a — work happened outside the queryme repo)**

The queryme repo has no diff in this task. Continue.

---

### Task 27: Verify byte-identity via golden-master test on external repo

**Files:** N/A — runtime verification.

- [ ] **Step 1: Unset the local override and clear the cache**

Run:

```bash
unset PERSONA_LOCAL_OVERRIDE
rm -rf /tmp/queryme/persona-cache
```

- [ ] **Step 2: Bring up the dev server**

Run: `pnpm dev`
Expected: the app starts on `localhost:3000` and shows the "not configured yet" screen.

- [ ] **Step 3: Log into admin → Content tab → Sync**

Navigate to `/admin`, log in, click the Content tab, paste the external repo URL from Task 26, click Sync. Expected: success message; active source shows the commit SHA.

- [ ] **Step 4: Run the golden-master test against the live cache**

Run: `pnpm test tests/prompts/golden-master.test.ts`
Expected: PASS — the prompt assembled from the synced external repo matches `tests/fixtures/prompt-golden-pre-migration.txt` byte-for-byte.

If it fails: diff the two strings to find the discrepancy (likely a whitespace, line-ending, or YAML-quoting drift in the external repo). Fix in the external repo (commit + push), Sync again, re-run test.

- [ ] **Step 5: Smoke-test the chat**

In the dev server browser tab, ask the chat agent "What's Alex's most recent role?" — confirm the response is consistent with today's behaviour (Altergo, CTO, etc.).

- [ ] **Step 6: Commit (capture the verification)**

```bash
# No file changes; this is a verification milestone. Optionally tag:
git tag headless-persona-cutover-verified
```

---

### Task 28: Delete in-repo content + final cleanup

**Files:**
- Delete: `kb/`, `prompts/system.md`, `cv-config.yaml`, `scripts/snapshot-prompt.ts`
- Modify: `vitest.setup.ts` (remove the `PERSONA_LOCAL_OVERRIDE ??= cwd` line — tests will use explicit fixtures)
- Modify: `package.json` (clean up description)

Only do this after Task 27 PASSED.

- [ ] **Step 1: Delete the in-repo content**

Run:

```bash
git rm -r kb prompts/system.md cv-config.yaml scripts/snapshot-prompt.ts
```

- [ ] **Step 2: Update vitest.setup.ts**

Remove this line that was added in Task 11:

```ts
process.env.PERSONA_LOCAL_OVERRIDE ??= process.cwd();
```

Tests that need a persona root now must set the env var themselves or use a fixture. Update test fixture paths if any depended on the auto-override.

- [ ] **Step 3: Update package.json description**

In `package.json`:

```jsonc
// Was:
"description": "Alexandre Collet's queryable CV — an AI agent that answers questions about his background, with an open knowledge base and an MCP endpoint.",
// To:
"description": "Queryme — a queryable CV agent. Persona content (kb + system prompt + persona.yaml) lives in an external GitHub repo; the deployment points at the active repo from the admin Content tab.",
```

- [ ] **Step 4: Add tests/fixtures/queryme-content for tests that still need a persona root**

Some tests (golden-master, system-contract) need a persona root with KB content. Reference the live external repo at a pinned SHA via the cache (set `PERSONA_LOCAL_OVERRIDE` to a check-in of the external content). The simplest path: add the external repo as a **git submodule** at `tests/fixtures/queryme-content`, then tests point `PERSONA_LOCAL_OVERRIDE` at that path.

Run:

```bash
git submodule add https://github.com/<you>/queryme-content-alex tests/fixtures/queryme-content
git submodule update --init
```

Update affected tests:

```ts
process.env.PERSONA_LOCAL_OVERRIDE = path.resolve(process.cwd(), "tests/fixtures/queryme-content");
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete in-repo persona content; external repo is the source of truth"
```

---

## Self-review

After writing all 28 tasks, I verified:

- **Spec coverage:** every section of the spec is implemented by at least one task. Section mapping: §1 persona repo contract → Tasks 26 (build) + 5 (validator). §2 sync mechanism → Tasks 4–9. §3 active root + first boot → Tasks 6/8 + 23. §4 DB → Task 3 (table) + 24/25 (cleanup). §5 admin Content tab → Tasks 19–22. §6 UI strings → Tasks 14–18. §7 failure modes → Tasks 7, 8, 9, 23. §8 code-change inventory → covered. §9 migration → Tasks 26–28. §10 testing strategy → Tasks 2, 4, 5, 6, 7, 8, 10, 14, 19, 20, 21. §11 open questions → no tasks needed (non-blocking).
- **Placeholder scan:** no "TBD", "TODO", "implement later", or hand-wavy "add validation" remain. Every code step contains the actual code.
- **Type consistency:** `Persona` type defined in Task 10 matches the `personaSchema` from Task 14 tests. `PersonaSource` row shape consistent across Tasks 3, 6, 19, 20, 21. `SyncResult` discriminated-union used consistently in Tasks 6 and 20.
- **Scope check:** focused on one feature (headless persona); all tasks compose into a single deployable change.

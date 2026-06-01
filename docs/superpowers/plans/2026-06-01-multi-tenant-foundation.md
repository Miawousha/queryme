# Multi-Tenant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make queryme multi-tenant at the engine level — accounts with per-account public KB repos served at `/{username}`, the existing CV preserved at `/`, accounts managed via the admin CLI.

**Architecture:** Add an `accounts` table and scope content resolution + conversation persistence by `account_id`. Replace the single global persona symlink/caches with per-account, LRU-bounded resolution behind a `PersonaStore` seam, reusing the existing `/tmp` tarball machinery. Routing resolves the root account (`ROOT_ACCOUNT_USERNAME`) at `/` and other accounts under a `[username]` segment guarded by a reserved-slug list. GitHub OAuth/self-serve signup and the email/DNS `account_settings` config are explicitly **deferred to later plans**.

**Tech Stack:** Next.js 15 (App Router, `runtime = "nodejs"`), Drizzle ORM + Postgres (Neon HTTP / postgres-js dual driver), vitest + Testing Library + MSW, tsx CLI.

**Sequencing principle:** every task leaves `pnpm typecheck` + `pnpm test` green. Tasks 4–5 introduce account-scoping behind a `getActivePersonaRoot()` → root-account shim so existing callers keep compiling; Task 8 removes the shim once all callers pass an account id.

**Spec:** `docs/superpowers/specs/2026-06-01-multi-tenant-accounts-kb-linking-design.md`

> **Note on `github_id`:** the spec assumed OAuth-first, where `github_id` is NOT NULL. This plan defers OAuth, so CLI-created accounts have no GitHub id yet — `github_id` is **nullable** here. Plan 2 (OAuth) populates it and adds the unique-when-present constraint.

---

### Task 1: Slug + username validation

**Files:**
- Create: `lib/accounts/slug.ts`
- Test: `tests/lib/accounts/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/accounts/slug.test.ts
import { describe, it, expect } from "vitest";
import { RESERVED_SLUGS, isReservedSlug, isValidUsername } from "@/lib/accounts/slug";

describe("isReservedSlug", () => {
  it("flags reserved top-level routes case-insensitively", () => {
    for (const s of ["about", "cv", "admin", "api", "login", "signup", "_next", "sitemap.xml", "favicon.ico"]) {
      expect(isReservedSlug(s)).toBe(true);
      expect(isReservedSlug(s.toUpperCase())).toBe(true);
    }
    expect(RESERVED_SLUGS.has("admin")).toBe(true);
  });
  it("does not flag ordinary usernames", () => {
    expect(isReservedSlug("alexcollet")).toBe(false);
  });
});

describe("isValidUsername", () => {
  it("accepts GitHub-style logins", () => {
    expect(isValidUsername("alexcollet")).toBe(true);
    expect(isValidUsername("a")).toBe(true);
    expect(isValidUsername("octo-cat")).toBe(true);
    expect(isValidUsername("a".repeat(39))).toBe(true);
  });
  it("rejects malformed, too-long, or reserved usernames", () => {
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername("-lead")).toBe(false);
    expect(isValidUsername("trail-")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("a".repeat(40))).toBe(false);
    expect(isValidUsername("admin")).toBe(false); // reserved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/accounts/slug.test.ts`
Expected: FAIL — cannot resolve `@/lib/accounts/slug`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/accounts/slug.ts

/**
 * Slugs that must never become account usernames because they collide with
 * existing top-level routes or framework/static paths. The `[username]` route
 * segment also rejects these as defence in depth.
 */
export const RESERVED_SLUGS = new Set<string>([
  "about", "cv", "admin", "api", "login", "signup",
  "_next", "sitemap.xml", "favicon.ico", "robots.txt",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// GitHub login rules: 1–39 chars, alphanumeric or single hyphens, no leading
// or trailing hyphen. (We do not enforce "no consecutive hyphens" — GitHub
// historically allowed them and we accept any login GitHub itself issued.)
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name) && !isReservedSlug(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/accounts/slug.test.ts`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
git add lib/accounts/slug.ts tests/lib/accounts/slug.test.ts
git commit -m "feat(accounts): add reserved-slug + username validation"
```

---

### Task 2: `accounts` table + `account_id` columns + migration

**Files:**
- Modify: `lib/db/schema.ts`
- Generate: `lib/db/migrations/0008_*.sql` (+ `meta/_journal.json`)

This is a schema change; the gate is `pnpm db:generate` producing a clean migration plus `pnpm typecheck`. No unit test.

- [ ] **Step 1: Add the `accounts` table to `lib/db/schema.ts`**

Add near the top of the table definitions (after imports). Note `github_id` is nullable (OAuth deferred):

```ts
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubId: text("github_id"), // nullable until OAuth (Plan 2); unique-when-present added then
    username: text("username").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
```

- [ ] **Step 2: Add nullable `account_id` to `conversations` and `persona_source`**

In the `conversations` table definition add:

```ts
  accountId: uuid("account_id").references(() => accounts.id),
```

and add an index inside its table-extras callback (create the callback if absent):

```ts
  (table) => ({
    accountLastMsgIdx: index("conversations_account_last_msg_idx").on(
      table.accountId,
      sql`${table.lastMessageAt} DESC`,
    ),
  }),
```

In the `persona_source` table definition add the same column:

```ts
  accountId: uuid("account_id").references(() => accounts.id),
```

and add to its existing extras callback:

```ts
    accountSyncedAtIdx: index("persona_source_account_synced_at_idx").on(
      table.accountId,
      sql`${table.syncedAt} DESC`,
    ),
```

(`index` is already imported in `schema.ts`.)

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `lib/db/migrations/0008_*.sql` creating `accounts`, adding `account_id` columns + FKs + indexes; `_journal.json` gains an entry. Open the SQL and confirm it only **adds** (no drops of existing columns/tables).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): add accounts table and account_id columns"
```

---

### Task 3: Account repository

**Files:**
- Create: `lib/accounts/repo.ts`
- Test: `tests/lib/accounts/repo.test.ts` (real-DB integration, mirrors `tests/lib/questions/repo.test.ts`)

> Before writing the test, read `tests/lib/questions/repo.test.ts` to copy its DB setup/teardown pattern (it uses `getDb()` against `POSTGRES_URL` from `.env.local`, cleaning up rows it creates). The integration tests are skipped automatically when `POSTGRES_URL` is unset — replicate that guard.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/accounts/repo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createAccount,
  getAccountBySlug,
  getAccountById,
  getRootAccount,
} from "@/lib/accounts/repo";

const hasDb = Boolean(process.env.POSTGRES_URL);
const d = hasDb ? describe : describe.skip;

d("accounts/repo (integration)", () => {
  const db = hasDb ? getDb() : (null as never);
  const username = `test-acct-${Date.now()}`;
  let createdId: string;

  afterAll(async () => {
    if (hasDb && createdId) await db.delete(accounts).where(eq(accounts.id, createdId));
  });

  it("creates an account and reads it back by slug and id", async () => {
    const acct = await createAccount(db, { username });
    createdId = acct.id;
    expect(acct.username).toBe(username);

    const bySlug = await getAccountBySlug(db, username);
    expect(bySlug?.id).toBe(acct.id);

    const byId = await getAccountById(db, acct.id);
    expect(byId?.username).toBe(username);
  });

  it("rejects invalid/reserved usernames before touching the DB", async () => {
    await expect(createAccount(db, { username: "admin" })).rejects.toThrow(/invalid/i);
    await expect(createAccount(db, { username: "has space" })).rejects.toThrow(/invalid/i);
  });

  it("resolves the root account from ROOT_ACCOUNT_USERNAME", async () => {
    const prev = process.env.ROOT_ACCOUNT_USERNAME;
    process.env.ROOT_ACCOUNT_USERNAME = username;
    try {
      const root = await getRootAccount(db);
      expect(root?.username).toBe(username);
    } finally {
      process.env.ROOT_ACCOUNT_USERNAME = prev;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/accounts/repo.test.ts`
Expected: FAIL — cannot resolve `@/lib/accounts/repo` (or all-skipped if no `POSTGRES_URL`; if skipped, set `POSTGRES_URL` in `.env.local` before continuing).

- [ ] **Step 3: Write the implementation**

```ts
// lib/accounts/repo.ts
import { eq } from "drizzle-orm";
import { accounts, type Account } from "@/lib/db/schema";
import { isValidUsername } from "@/lib/accounts/slug";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function createAccount(
  db: Db,
  input: { username: string; githubId?: string | null },
): Promise<Account> {
  if (!isValidUsername(input.username)) {
    throw new Error(`invalid username: ${JSON.stringify(input.username)}`);
  }
  const [row] = await db
    .insert(accounts)
    .values({ username: input.username, githubId: input.githubId ?? null })
    .returning();
  return row;
}

export async function getAccountBySlug(db: Db, slug: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.username, slug)).limit(1);
  return row ?? null;
}

export async function getAccountById(db: Db, id: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return row ?? null;
}

/** The "house" account served at `/`. Configured via ROOT_ACCOUNT_USERNAME. */
export async function getRootAccount(db: Db): Promise<Account | null> {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  if (!username) return null;
  return getAccountBySlug(db, username);
}

export async function getRootAccountId(db: Db): Promise<string> {
  const root = await getRootAccount(db);
  if (!root) {
    throw new Error(
      "ROOT_ACCOUNT_USERNAME is not set or no matching account exists. " +
        "Run `pnpm admin account create <username>` and the backfill script.",
    );
  }
  return root.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/accounts/repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/accounts/repo.ts tests/lib/accounts/repo.test.ts
git commit -m "feat(accounts): add account repository (create/getBySlug/getById/root)"
```

---

### Task 4: Account-scoped persona resolution behind a `PersonaStore` seam

**Files:**
- Create: `lib/persona/store.ts` (interface + FS implementation)
- Modify: `lib/persona-source.ts` (functions become account-scoped; keep a root-resolving `getActivePersonaRoot()` shim)
- Modify: `tests/lib/persona-source.test.ts` (pass an account id)

**Contract — every persona-source function gains a leading `accountId`:**

```ts
getPersonaRoot(accountId: string): string | null
syncFromGitHub(accountId: string, repoUrl: string, branch?: string): Promise<SyncResult>
ensurePersonaCacheReady(accountId: string): Promise<void>
getActivePersonaSourceRow(accountId: string): Promise<PersonaSource | null>
listSyncHistory(accountId: string, limit?: number): Promise<PersonaSource[]>
```

**Implementation notes (read `lib/persona-source.ts` first — it already has all the machinery):**
- Cache dirs become per-account: `cacheRoot()/{accountId}/{sha}` and the symlink `cacheRoot()/{accountId}/current`. Add `accountCacheRoot(accountId) = path.join(cacheRoot(), accountId)`.
- `getPersonaRoot(accountId)`: if `PERSONA_LOCAL_OVERRIDE` is set, return it (dev/test single-root override — ignores accountId by design); else `fs.readlinkSync(accountCacheRoot(accountId)/current)`.
- `inFlight` becomes `const inFlight = new Map<string, Promise<SyncResult>>()` keyed by accountId.
- `recordRow(...)` and every `personaSource` insert/select gains `accountId` (insert sets it; the active/history queries filter `eq(personaSource.accountId, accountId)`).
- `cleanupOldShas` scopes its `readdir`/keep-set to that account's dir.
- Keep the back-compat shim so existing callers/caches compile unchanged this task:

```ts
// Resolves the ROOT account's persona root. Temporary shim retained until all
// callers pass an explicit accountId (removed in Task 8).
export function getActivePersonaRoot(): string | null {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return process.env.PERSONA_LOCAL_OVERRIDE;
  // Best-effort: read the root account's current symlink synchronously is not
  // possible without the id, so the shim relies on PERSONA_LOCAL_OVERRIDE in
  // tests and on callers migrating in Task 5. Return null when unavailable.
  return null;
}
```

> The shim returns the override (covers all current tests, which run with `PERSONA_LOCAL_OVERRIDE` set) and otherwise `null`. Task 5 migrates runtime callers to `getPersonaRoot(rootAccountId)`, so the shim's `null` branch is never hit in production before its removal.

- [ ] **Step 1: Write `lib/persona/store.ts` (the seam)**

```ts
// lib/persona/store.ts
import type { SyncResult } from "@/lib/persona-source";

/**
 * Resolves and synchronises an account's persona content. The v1 implementation
 * is filesystem-backed (per-account /tmp cache); this interface exists so a
 * materialized-store implementation can replace it later without touching
 * callers.
 */
export interface PersonaStore {
  getRoot(accountId: string): string | null;
  ensureReady(accountId: string): Promise<void>;
  sync(accountId: string, repoUrl: string, branch?: string): Promise<SyncResult>;
}

import {
  getPersonaRoot,
  ensurePersonaCacheReady,
  syncFromGitHub,
} from "@/lib/persona-source";

export const fsPersonaStore: PersonaStore = {
  getRoot: (accountId) => getPersonaRoot(accountId),
  ensureReady: (accountId) => ensurePersonaCacheReady(accountId),
  sync: (accountId, repoUrl, branch) => syncFromGitHub(accountId, repoUrl, branch),
};

export function getPersonaStore(): PersonaStore {
  return fsPersonaStore;
}
```

- [ ] **Step 2: Refactor `lib/persona-source.ts` to the account-scoped contract**

Apply the implementation notes above. Export `SyncResult`, `ParsedRepo` as today. Keep `parseGitHubRepoUrl`, `validatePersonaTree`, `resolveLatestSha`, `REQUIRED_PERSONA_FILES` unchanged. Keep the `getActivePersonaRoot()` shim.

- [ ] **Step 3: Update `tests/lib/persona-source.test.ts`**

Pass a fixed test account id (e.g. `const ACCT = "00000000-0000-0000-0000-000000000001"`) to each call. The happy-path integration test that inserts a `persona_source` row must clean up rows for `ACCT`. Where the test asserts `getActivePersonaRoot()`, switch to `getPersonaRoot(ACCT)` (with `PERSONA_LOCAL_OVERRIDE` set, it returns the fixture).

- [ ] **Step 4: Run the persona-source + store tests**

Run: `pnpm vitest run tests/lib/persona-source.test.ts`
Expected: PASS. Then `pnpm typecheck` — the shim keeps `lib/kb/cache.ts`, `lib/prompts.ts`, `app/page.tsx`, `app/api/chat`, `app/api/mcp` compiling.

- [ ] **Step 5: Commit**

```bash
git add lib/persona/store.ts lib/persona-source.ts tests/lib/persona-source.test.ts
git commit -m "feat(persona): account-scope persona resolution behind PersonaStore seam"
```

---

### Task 5: Account-scope the in-memory caches and migrate all current callers

**Files:**
- Modify: `lib/kb/cache.ts`, `lib/prompts.ts`, `lib/persona.ts`
- Modify callers: `app/page.tsx`, `app/api/chat/route.ts`, `app/api/mcp/route.ts`, `app/api/kb/route.ts`, `app/api/kb/file/route.ts`, `app/api/cv/route.ts`, `app/admin/page.tsx`, `app/cv/page.tsx`, `app/about/page.tsx`, and `lib/mcp/server.ts` (anything calling `getCachedKb`/`getCachedPublicKbText`/`getCachedKbManifest`/`buildSystemPromptParts`/`loadPersona`/`getActivePersonaRoot`/`getActivePersonaSourceRow`)
- Modify tests: `tests/lib/prompts.test.ts`, `tests/lib/persona.test.ts`, `tests/app/api/chat/route.test.ts`, any test calling the cache APIs.

> First, enumerate exact callers: `grep -rn "getCachedKb\|getCachedPublicKbText\|getCachedKbManifest\|buildSystemPromptParts\|getActivePersonaRoot\|getActivePersonaSourceRow\|loadPersona\b" app lib` and migrate each.

**New cache contract (all take a leading `accountId`):**

```ts
// lib/kb/cache.ts
getCachedKb(accountId: string, lang?: KbLang): Promise<Kb>
getCachedPublicKbText(accountId: string, lang?: KbLang): Promise<string>
getCachedKbManifest(accountId: string): Promise<KbFile[]>
resetKbCache(accountId: string): void
```

**Implementation — replace the module singletons with per-account, LRU-bounded maps.** Add a tiny LRU helper at the top of `lib/kb/cache.ts`:

```ts
const MAX_ACCOUNTS = 50;

/** Insertion-ordered Map used as an LRU: re-set on access, evict oldest at cap. */
function lruGet<V>(m: Map<string, V>, key: string): V | undefined {
  const v = m.get(key);
  if (v !== undefined) { m.delete(key); m.set(key, v); }
  return v;
}
function lruSet<V>(m: Map<string, V>, key: string, value: V): void {
  m.delete(key);
  m.set(key, value);
  if (m.size > MAX_ACCOUNTS) m.delete(m.keys().next().value as string);
}
```

Change the singletons to per-account maps and resolve the root via the store:

```ts
import { getPersonaStore } from "@/lib/persona/store";

const parsedKbByAccount = new Map<string, Map<KbLang, Kb>>();
const publicKbTextByAccount = new Map<string, Map<KbLang, string>>();
const cvConfigByAccount = new Map<string, Promise<CvConfig | null>>();
const manifestByAccount = new Map<string, KbFile[]>();

function rootFor(accountId: string): string {
  const root = getPersonaStore().getRoot(accountId);
  if (!root) throw new Error(`Persona not configured for account ${accountId}`);
  return root;
}
```

Each getter reads/writes its per-account sub-map via `lruGet`/`lruSet`, computing dirs from `rootFor(accountId)`. `resetKbCache(accountId)` deletes that account's entries from all four maps.

**`lib/prompts.ts`:** `cachedHeader` becomes `const headerByAccount = new Map<string, string>()`; `readHeader(accountId)` resolves `rootFor(accountId)`; `buildSystemPromptParts({ accountId, kbText })`; `_resetPromptCache(accountId)`.

**`lib/persona.ts`:** `cached` becomes `const byRoot = new Map<string, Persona>()` keyed by the resolved root path (already per-account + per-SHA), so `loadPersona(activeRoot)` keeps its signature but caches per-root; `_resetPersonaCache()` clears the map. (No signature change needed — callers pass the per-account root.)

**Caller migration:** every runtime caller resolves the account id first. For the existing single-tenant surfaces that is the root account:

```ts
import { getDb } from "@/lib/db/client";
import { getRootAccountId } from "@/lib/accounts/repo";
// ...
const accountId = await getRootAccountId(getDb());
await getPersonaStore().ensureReady(accountId);
const root = getPersonaStore().getRoot(accountId);
if (!root) return /* not-configured response */;
const kbText = await getCachedPublicKbText(accountId, lang);
```

Replace `ensurePersonaCacheReady()` → `getPersonaStore().ensureReady(accountId)` and `getActivePersonaRoot()` → `getPersonaStore().getRoot(accountId)` in each caller. `getActivePersonaSourceRow()` → `getActivePersonaSourceRow(accountId)`.

- [ ] **Step 1: Write/adjust the failing tests**

Update `tests/lib/prompts.test.ts` and `tests/lib/persona.test.ts` to pass `ACCT` (a uuid string) and confirm `PERSONA_LOCAL_OVERRIDE` resolution still returns the fixture. Update `tests/app/api/chat/route.test.ts` mocks so the chat route resolves a root account id (mock `getRootAccountId` to return a constant). Add a cache-isolation test:

```ts
// tests/lib/kb/cache.test.ts (new)
import { describe, it, expect } from "vitest";
import { getCachedPublicKbText } from "@/lib/kb/cache";

describe("kb cache (per-account)", () => {
  it("serves the fixture for any account id under PERSONA_LOCAL_OVERRIDE", async () => {
    const a = await getCachedPublicKbText("acct-a", "en");
    const b = await getCachedPublicKbText("acct-b", "en");
    expect(a.length).toBeGreaterThan(0);
    expect(b).toBe(a); // same override root → same text
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/cache.test.ts tests/lib/prompts.test.ts`
Expected: FAIL — getter signatures don't take `accountId` yet.

- [ ] **Step 3: Implement the cache/loader changes and migrate callers**

Apply the contract + implementation above; migrate every caller found by the grep.

- [ ] **Step 4: Run the full suite + typecheck**

Run: `pnpm vitest run` then `pnpm typecheck`
Expected: PASS. App behaviour is unchanged (everything still resolves the root account).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cache.ts lib/prompts.ts lib/persona.ts app lib tests
git commit -m "refactor(content): account-scope KB/prompt/persona caches and migrate callers to root account"
```

---

### Task 6: Per-account routing and chat API

**Files:**
- Create: `app/[username]/page.tsx`, `app/[username]/not-found.tsx`
- Create: `app/api/a/[username]/chat/route.ts`
- Modify: `app/page.tsx` (canonical-URL redirect note), `next.config.ts` if needed
- Create test: `tests/app/username-routing.test.ts`

**Account resolution helper** — add to `lib/accounts/repo.ts` (used by the segment):

```ts
/** Resolve a path slug to an account, rejecting reserved slugs. Null = 404. */
export async function resolveAccountSlug(db: Db, slug: string): Promise<Account | null> {
  if (isReservedSlug(slug)) return null; // (import isReservedSlug)
  return getAccountBySlug(db, slug);
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/username-routing.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
const resolveAccountSlug = vi.fn();
vi.mock("@/lib/accounts/repo", () => ({ resolveAccountSlug }));

describe("[username] segment account resolution", () => {
  beforeEach(() => resolveAccountSlug.mockReset());

  it("returns null (→404) for a reserved slug", async () => {
    resolveAccountSlug.mockResolvedValue(null);
    const { loadAccountForSlug } = await import("@/app/[username]/load");
    expect(await loadAccountForSlug("admin")).toBeNull();
  });

  it("returns the account for a known slug", async () => {
    resolveAccountSlug.mockResolvedValue({ id: "id-1", username: "alexcollet" });
    const { loadAccountForSlug } = await import("@/app/[username]/load");
    const acct = await loadAccountForSlug("alexcollet");
    expect(acct?.username).toBe("alexcollet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/username-routing.test.ts`
Expected: FAIL — `@/app/[username]/load` missing.

- [ ] **Step 3: Implement the segment + API**

`app/[username]/load.ts` — extract the resolution so it is unit-testable:

```ts
// app/[username]/load.ts
import { getDb } from "@/lib/db/client";
import { resolveAccountSlug } from "@/lib/accounts/repo";
import type { Account } from "@/lib/db/schema";

export async function loadAccountForSlug(slug: string): Promise<Account | null> {
  return resolveAccountSlug(getDb(), slug);
}
```

`app/[username]/page.tsx` — mirror `app/page.tsx` but scoped to the resolved account, and redirect the root slug to `/`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getPersonaStore } from "@/lib/persona/store";
import { loadPersona } from "@/lib/persona";
import { buildUiStrings } from "@/lib/language";
import { HomePageClient } from "@/components/home-page-client";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import { getActivePersonaSourceRow } from "@/lib/persona-source";
import { loadAccountForSlug } from "./load";

export default async function AccountHome({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (username === process.env.ROOT_ACCOUNT_USERNAME) redirect("/");
  const account = await loadAccountForSlug(username);
  if (!account) notFound();

  const store = getPersonaStore();
  await store.ensureReady(account.id);
  const root = store.getRoot(account.id);
  if (!root) return <NotConfiguredScreen />;

  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  const sourceRow = await getActivePersonaSourceRow(account.id);
  return (
    <HomePageClient
      strings={strings}
      contentRepoUrl={sourceRow?.repoUrl ?? null}
      apiBasePath={`/api/a/${account.username}`}
    />
  );
}
```

> `HomePageClient` currently posts to `/api/chat`. Add an optional `apiBasePath` prop (default `"/api"`); the chat client posts to `${apiBasePath}/chat`. `app/page.tsx` omits the prop → `/api/chat` (unchanged behaviour); the `[username]` page passes `apiBasePath={`/api/a/${account.username}`}` → `/api/a/${username}/chat`. The MCP endpoint stays `/api/mcp` (root-only this plan).

`app/api/a/[username]/chat/route.ts` — extract the chat handler so root and per-account share it. Move the body of `app/api/chat/route.ts` into `lib/chat/handle-chat.ts` as `handleChat(req, accountId)`; the root route calls it with `await getRootAccountId(getDb())`, and the per-account route resolves the slug:

```ts
// app/api/a/[username]/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { handleChat } from "@/lib/chat/handle-chat";
import { loadAccountForSlug } from "@/app/[username]/load";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  return handleChat(req, account.id);
}
```

`handleChat(req, accountId)` is the current chat route body with `accountId` threaded into `ensureReady`, `getCachedPublicKbText(accountId, …)`, conversation inserts (`getOrCreateConversation` gains `accountId`), and a rate-limit key prefixed by account: `chat:${accountId}:ip:${requestIp(req)}`. Update `getOrCreateConversation` to accept + persist `accountId`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run tests/app/username-routing.test.ts tests/app/api/chat/route.test.ts` then `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app lib/chat tests/app
git commit -m "feat(routing): serve accounts at /{username} with per-account chat API"
```

---

### Task 7: CLI — `account create` and `account link`

**Files:**
- Modify: `scripts/lib/admin-args.ts` (parse `account` subcommands), `scripts/lib/admin-run.ts` (MANIFEST + handlers + dispatch)
- Test: `tests/scripts/lib/admin-run.test.ts`, `tests/scripts/lib/admin-args.test.ts`

> Read `scripts/lib/admin-args.ts` for the `ParsedCommand` union shape; add an `account` command with a `sub: "create" | "link"`, positional `username`, and (for link) positional `repoUrl` + optional `--branch`.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/scripts/lib/admin-args.test.ts
it("parses `account create <username>`", () => {
  const p = parseAdminArgs(["account", "create", "alexcollet"]);
  expect(p.kind).toBe("ok");
  if (p.kind !== "ok") return;
  expect(p.parsed).toMatchObject({ command: "account", sub: "create", username: "alexcollet" });
});
it("parses `account link <username> <repoUrl>`", () => {
  const p = parseAdminArgs(["account", "link", "alexcollet", "https://github.com/o/r"]);
  expect(p.kind).toBe("ok");
  if (p.kind !== "ok") return;
  expect(p.parsed).toMatchObject({ command: "account", sub: "link", username: "alexcollet", repoUrl: "https://github.com/o/r" });
});
```

```ts
// add to tests/scripts/lib/admin-run.test.ts — account create happy path (mock the repo + sync)
it("creates an account", async () => {
  // follow the file's existing mocking style for @/lib/db/client and @/lib/accounts/repo
  const out = await run(["account", "create", "alexcollet", "--json"], { env: { POSTGRES_URL: "x" }, isTTY: false });
  expect(out.exitCode).toBe(0);
  expect(JSON.parse(out.stdout)).toMatchObject({ ok: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/scripts/lib/admin-args.test.ts tests/scripts/lib/admin-run.test.ts`
Expected: FAIL — `account` command not recognised.

- [ ] **Step 3: Implement parser + handlers**

In `admin-args.ts`, extend the `ParsedCommand` union with
`{ command: "account"; sub: "create" | "link"; username: string; repoUrl?: string; branch?: string; outputFlag?: ... }`
and parse it. In `admin-run.ts` add a MANIFEST entry and:

```ts
async function handleAccount(cmd, ctx): Promise<HandlerOutput> {
  const db = getDb(); // import getDb from "@/lib/db/client"
  if (cmd.sub === "create") {
    const acct = await createAccount(db, { username: cmd.username });
    return { result: { ok: true, account: acct }, pretty: `created account ${acct.username} (${acct.id})` };
  }
  // link
  const acct = await getAccountBySlug(db, cmd.username);
  if (!acct) throw new CliError(`no account '${cmd.username}'`, "create it first: admin account create <username>");
  if (!cmd.repoUrl) throw new CliError("repoUrl required for link", "admin account link <username> <repoUrl>");
  const res = await syncFromGitHub(acct.id, cmd.repoUrl, cmd.branch ?? "main");
  if (res.kind === "error") throw new CliError(res.message, "check the repo URL/branch and required persona files");
  return { result: { ok: true, account: acct.username, commitSha: res.commitSha }, pretty: `linked ${cmd.username} -> ${cmd.repoUrl} @ ${res.commitSha.slice(0,8)}` };
}
```

Add `case "account": return handleAccount(cmd, ctx);` to `dispatch`. The existing `sync`/`status` handlers must also pass an account id now that `getActivePersonaSourceRow`/`syncFromGitHub`/`listSyncHistory` are account-scoped — default them to `await getRootAccountId(getDb())`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run tests/scripts` then `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts tests/scripts
git commit -m "feat(cli): add `account create` and `account link` commands"
```

---

### Task 8: Backfill script, env/docs, remove the shim, end-to-end integration test

**Files:**
- Create: `scripts/backfill-root-account.ts` + `lib/db/migrations/0009_*.sql` (NOT NULL)
- Modify: `.env.example`, `README.md`
- Modify: `lib/persona-source.ts` (delete the `getActivePersonaRoot()` shim)
- Create test: `tests/lib/accounts/two-account-isolation.test.ts`

> `getOrCreateConversation` already accepts + persists `accountId` (wired in Task 6). This test is the **end-to-end regression guard** for that scoping — it should PASS once Task 6 landed; if it fails, accountId isn't being persisted.

- [ ] **Step 1: Write the integration test**

```ts
// tests/lib/accounts/two-account-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts, conversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAccount } from "@/lib/accounts/repo";
import { getOrCreateConversation } from "@/lib/conversations/repo";
import { randomUUID } from "node:crypto";

const hasDb = Boolean(process.env.POSTGRES_URL);
const d = hasDb ? describe : describe.skip;

d("two-account isolation (integration)", () => {
  const db = getDb();
  const ids: string[] = [];
  const convIds: string[] = [];

  afterAll(async () => {
    for (const c of convIds) await db.delete(conversations).where(eq(conversations.id, c));
    for (const id of ids) await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("scopes conversations to their owning account", async () => {
    const a = await createAccount(db, { username: `iso-a-${Date.now()}` }); ids.push(a.id);
    const b = await createAccount(db, { username: `iso-b-${Date.now()}` }); ids.push(b.id);

    const ca = randomUUID(); convIds.push(ca);
    await getOrCreateConversation(db, { id: ca, channel: "chat", accountId: a.id });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, ca));
    expect(row.accountId).toBe(a.id);
    expect(row.accountId).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run the regression test**

Run: `pnpm vitest run tests/lib/accounts/two-account-isolation.test.ts`
Expected: PASS — confirms `getOrCreateConversation` persists `accountId` and the two accounts stay isolated. If it fails, fix the `accountId` thread-through in `lib/conversations/repo.ts` from Task 6 before continuing.

- [ ] **Step 3: Backfill script + NOT NULL migration + docs + shim removal**

`scripts/backfill-root-account.ts`:

```ts
import fs from "node:fs";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
import { getDb } from "@/lib/db/client";
import { accounts, conversations, personaSource } from "@/lib/db/schema";
import { sql, isNull, eq } from "drizzle-orm";
import { createAccount, getAccountBySlug } from "@/lib/accounts/repo";

async function main() {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  if (!username) throw new Error("set ROOT_ACCOUNT_USERNAME");
  const db = getDb();
  let root = await getAccountBySlug(db, username);
  if (!root) root = await createAccount(db, { username });
  await db.update(conversations).set({ accountId: root.id }).where(isNull(conversations.accountId));
  await db.update(personaSource).set({ accountId: root.id }).where(isNull(personaSource.accountId));
  process.stdout.write(`backfilled to root account ${root.username} (${root.id})\n`);
}
main().then(() => process.exit(0)).catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
```

Add to `package.json` scripts: `"backfill:root": "tsx scripts/backfill-root-account.ts"`.

After running the backfill, make the columns NOT NULL: change `accountId: uuid("account_id").references(...)` to `.notNull().references(...)` in `schema.ts`, then `pnpm db:generate` → `0009_*.sql`.

Remove the now-unused `getActivePersonaRoot()` shim from `lib/persona-source.ts` and run the grep from Task 5 to confirm zero remaining callers.

`.env.example`: add
```
# Username (GitHub login) of the house account served at /
ROOT_ACCOUNT_USERNAME=
```
`README.md`: add a "Multi-tenant accounts" section documenting `pnpm admin account create <username>`, `pnpm admin account link <username> <repoUrl>`, `ROOT_ACCOUNT_USERNAME`, and `pnpm backfill:root`.

- [ ] **Step 4: Run the full suite, typecheck, and build**

Run: `pnpm vitest run` then `pnpm typecheck` then `pnpm build`
Expected: all PASS; no remaining references to `getActivePersonaRoot`.

- [ ] **Step 5: Commit**

```bash
git add scripts lib package.json .env.example README.md tests/lib/accounts/two-account-isolation.test.ts
git commit -m "feat(accounts): backfill root account, enforce NOT NULL, drop legacy shim, document CLI"
```

---

## Manual verification (after Task 8)

1. Set `ROOT_ACCOUNT_USERNAME` in `.env.local`; run `pnpm db:migrate` then `pnpm backfill:root`.
2. `pnpm admin account create testuser` → `pnpm admin account link testuser https://github.com/<owner>/<public-kb-repo>`.
3. `pnpm dev`: `/` still serves your CV; `/testuser` serves the linked KB and chat works; `/admin` (reserved) and an unknown slug 404; `/{ROOT_ACCOUNT_USERNAME}` redirects to `/`.

## Deferred to later plans (out of scope here)

- GitHub OAuth, sessions carrying `accountId`, self-serve signup, per-account admin scoping (Plan 2).
- `account_settings` table + inert email/DNS config UI (Plan 3).
- Per-account MCP endpoints (`/api/a/{username}/mcp`) — `/api/mcp` stays root-only this plan.
- Billing/metering, custom-domain routing/TLS, private repos, account deletion/rename.

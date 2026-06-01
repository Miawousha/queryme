# GitHub OAuth + Tiered Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared-password admin with GitHub OAuth + self-serve signup, scope admin per account, and add a super-admin console — wiring the landing page's "Sign in with GitHub" button to a working flow.

**Architecture:** A signed `queryme_session` cookie carries the owning `accountId` (HMAC/`SESSION_SECRET`), minted by either GitHub OAuth (browser) or the retained `ADMIN_PASSWORD` machine login (CLI `--remote`). Account guards (`requireSessionAccount`/`canAdminister`/`requireSuperAdmin`/`requireRootAdmin`) authorize per-account admin at `/{username}/admin` and a super console at `/admin`. First OAuth login auto-provisions (or claims) an account keyed by `github_id`.

**Tech Stack:** Next.js 15 (App Router, `runtime = "nodejs"`), Drizzle ORM + Postgres, vitest + Testing Library + MSW, tsx CLI. GitHub OAuth web flow (`read:user`).

**Spec:** `docs/superpowers/specs/2026-06-01-github-oauth-and-tiered-admin-design.md`

**Sequencing principle:** every task leaves `pnpm typecheck` + `pnpm test` green. Task 3 swaps the auth mechanism while keeping the existing admin surfaces root-scoped (guard `requireRootAdmin`); Tasks 5–7 introduce per-account + super surfaces; Task 7 removes the browser password UI. DB-integration tests are opt-in via `RUN_DB_TESTS` (skipped by default).

## File structure

**New files**
- `lib/accounts/guard.ts` — session→account guards (`requireSessionAccount`, `canAdminister`, `requireSuperAdmin`, `requireRootAdmin`).
- `lib/accounts/errors.ts` — `ReservedLoginError`, `SlugConflictError`.
- `lib/auth/github.ts` — GitHub HTTP seam (`buildAuthorizeUrl`, `exchangeCodeForToken`, `fetchGitHubUser`).
- `lib/auth/oauth-state.ts` — signed CSRF `state` (`createState`, `verifyState`, `constantTimeEqual`).
- `lib/admin/persona-source-api.ts` — account-scoped status/sync used by both the root alias and per-account routes.
- `lib/admin/analytics-api.ts` — account-scoped analytics read model.
- `lib/questions/account.ts` — `getQuestionAccountId` (question→conversation→account ownership).
- `app/api/auth/github/login/route.ts`, `app/api/auth/github/callback/route.ts`, `app/api/auth/logout/route.ts`.
- `app/auth/error/page.tsx` — OAuth failure surface.
- `app/[username]/admin/page.tsx` — per-account admin (resolves slug + guard).
- `app/api/a/[username]/admin/persona-source/route.ts`, `.../analytics/route.ts`, `.../questions/[id]/reply/route.ts`.
- `components/admin/account-list.tsx` — super console table.

**Modified files**
- `lib/db/schema.ts` — `accounts.role` + partial unique `github_id` index (+ migration `0009`).
- `lib/accounts/repo.ts` — `role` on create, `getAccountByGithubId`, `upsertAccountFromGitHub`, `setAccountRole`, `listAllAccounts`.
- `lib/admin/auth.ts` — `accountId` token payload, `getSessionAccountId`, `SESSION_COOKIE`; keep `verifyPassword`; remove `isAdminAuthenticated`/`ADMIN_COOKIE`.
- `lib/admin/data.ts` — `loadAdminData(db, accountId)`.
- `app/api/admin/login/route.ts` — mint a **root** session; `app/api/admin/persona-source/route.ts` — `requireRootAdmin` + shared api module; delete `app/api/admin/logout/route.ts`, `app/api/admin/analytics/route.ts`, `app/api/admin/questions/`.
- `app/admin/page.tsx` — super console (Task 7); `components/admin/{admin-dashboard,content-tab,logout-button}.tsx` — `apiBasePath`; delete `components/admin/admin-login.tsx` (Task 7).
- `scripts/lib/admin-args.ts`, `scripts/lib/admin-run.ts` — `account promote|demote`; `scripts/backfill-root-account.ts` — seed `role='admin'`.
- `components/landing/landing-page.tsx` — live login link.
- `lib/accounts/slug.ts` — reserve `auth`.
- `.env.example`, `README.md`.

---

### Task 1: `accounts.role` + partial unique `github_id` index + migration `0009`

**Files:**
- Modify: `lib/db/schema.ts`
- Generate: `lib/db/migrations/0009_*.sql` (+ `meta/_journal.json`)

Schema change; the gate is `pnpm db:generate` producing a clean additive migration plus `pnpm typecheck`. No unit test.

- [ ] **Step 1: Add `uniqueIndex` to the imports and edit the `accounts` table**

In `lib/db/schema.ts`, change the first import line to include `uniqueIndex`:

```ts
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
```

Replace the `accounts` table definition with (adds `role`, adds the partial unique index via a table-extras callback):

```ts
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubId: text("github_id"), // unique-when-present (see index below)
    username: text("username").notNull().unique(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    githubIdUnique: uniqueIndex("accounts_github_id_unique")
      .on(table.githubId)
      .where(sql`github_id IS NOT NULL`),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `lib/db/migrations/0009_*.sql` that (a) adds the `role` column with default `'user'` NOT NULL and (b) creates `accounts_github_id_unique` as a partial unique index (`WHERE github_id IS NOT NULL`); `_journal.json` gains an entry. Open the SQL and confirm it only **adds** (no drops, no unconditional NOT NULL on existing data besides `role` which has a default).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`Account.role` is now `"user" | "admin"`.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): add accounts.role and partial-unique github_id index"
```

---

### Task 2: Account repo — role, github upsert/claim, role setter, listing

**Files:**
- Create: `lib/accounts/errors.ts`
- Modify: `lib/accounts/repo.ts`
- Modify: `tests/lib/accounts/repo.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/accounts/repo.test.ts`. First extend the top imports:

```ts
import {
  createAccount,
  getAccountBySlug,
  getAccountById,
  getRootAccount,
  getAccountByGithubId,
  upsertAccountFromGitHub,
  setAccountRole,
  listAllAccounts,
} from "@/lib/accounts/repo";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";
```

Add a pure (no-DB) test inside the existing `describe("createAccount validation", ...)` block, after the existing `it`:

```ts
  it("rejects a reserved GitHub login in upsert before any DB call", async () => {
    const fakeDb = {} as never;
    await expect(
      upsertAccountFromGitHub(fakeDb, { githubId: "1", login: "admin" }),
    ).rejects.toBeInstanceOf(ReservedLoginError);
  });
```

Add new DB-integration cases inside the existing `d("accounts/repo (integration)", ...)` block (reuse its `db`; track created ids for cleanup). Append after the existing `it`s, and extend the `afterAll` to also delete `extraIds`:

```ts
  const extraIds: string[] = [];
  afterAll(async () => {
    for (const id of extraIds) await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("upsert: creates, then claims a github_id-null account, then conflicts", async () => {
    const login = `up-${Date.now()}`;
    // create path
    const created = await upsertAccountFromGitHub(db, { githubId: `gh-${login}`, login });
    extraIds.push(created.id);
    expect(created.username).toBe(login);
    expect(created.githubId).toBe(`gh-${login}`);

    // returning path: same github_id resolves the same row
    const again = await upsertAccountFromGitHub(db, { githubId: `gh-${login}`, login });
    expect(again.id).toBe(created.id);

    // claim path: a CLI-created (github_id null) account is adopted
    const cliLogin = `cli-${Date.now()}`;
    const cli = await createAccount(db, { username: cliLogin });
    extraIds.push(cli.id);
    expect(cli.githubId).toBeNull();
    const claimed = await upsertAccountFromGitHub(db, { githubId: `gh-${cliLogin}`, login: cliLogin });
    expect(claimed.id).toBe(cli.id);
    expect(claimed.githubId).toBe(`gh-${cliLogin}`);

    // conflict path: same slug, different github_id
    await expect(
      upsertAccountFromGitHub(db, { githubId: "someone-else", login: cliLogin }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it("getAccountByGithubId resolves a created account", async () => {
    const login = `byid-${Date.now()}`;
    const a = await createAccount(db, { username: login, githubId: `g-${login}` });
    extraIds.push(a.id);
    const found = await getAccountByGithubId(db, `g-${login}`);
    expect(found?.id).toBe(a.id);
    expect(await getAccountByGithubId(db, "no-such-id")).toBeNull();
  });

  it("setAccountRole flips a role and listAllAccounts reports it", async () => {
    const login = `role-${Date.now()}`;
    const a = await createAccount(db, { username: login });
    extraIds.push(a.id);
    expect(a.role).toBe("user");
    const promoted = await setAccountRole(db, login, "admin");
    expect(promoted.role).toBe("admin");
    const all = await listAllAccounts(db);
    const summary = all.find((s) => s.username === login);
    expect(summary).toBeDefined();
    expect(summary?.role).toBe("admin");
    expect(summary?.repoLinked).toBe(false);
    expect(summary?.conversationCount).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/accounts/repo.test.ts`
Expected: FAIL — cannot resolve `@/lib/accounts/errors` and the new repo exports.

- [ ] **Step 3: Create the error classes**

```ts
// lib/accounts/errors.ts

/** The GitHub login is a reserved slug, so no account can be auto-provisioned. */
export class ReservedLoginError extends Error {
  constructor(login: string) {
    super(`'${login}' is a reserved name and cannot be used as an account`);
    this.name = "ReservedLoginError";
  }
}

/** The slug already belongs to a different GitHub identity (slug is immutable in v1). */
export class SlugConflictError extends Error {
  constructor(login: string) {
    super(`username '${login}' is already claimed by another GitHub identity`);
    this.name = "SlugConflictError";
  }
}
```

- [ ] **Step 4: Extend `lib/accounts/repo.ts`**

Update the imports at the top:

```ts
import { eq, desc, sql } from "drizzle-orm";
import {
  accounts,
  conversations,
  personaSource,
  type Account,
} from "@/lib/db/schema";
import { isValidUsername, isReservedSlug } from "@/lib/accounts/slug";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";
import type { getDb } from "@/lib/db/client";
```

Change `createAccount` to accept an optional `role`:

```ts
export async function createAccount(
  db: Db,
  input: { username: string; githubId?: string | null; role?: "user" | "admin" },
): Promise<Account> {
  if (!isValidUsername(input.username)) {
    throw new Error(`invalid username: ${JSON.stringify(input.username)}`);
  }
  const [row] = await db
    .insert(accounts)
    .values({
      username: input.username,
      githubId: input.githubId ?? null,
      role: input.role ?? "user",
    })
    .returning();
  return row;
}
```

Append the new functions (after `getRootAccountId`):

```ts
export async function getAccountByGithubId(db: Db, githubId: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.githubId, githubId)).limit(1);
  return row ?? null;
}

/**
 * Resolve (or provision) the account for an authenticated GitHub identity.
 * - existing github_id → return it
 * - existing slug with null github_id → claim it (adopts CLI-created accounts)
 * - existing slug with a different github_id → SlugConflictError
 * - otherwise → create (slug = login, role 'user')
 * Reserved logins are rejected up front so this never touches the DB for them.
 */
export async function upsertAccountFromGitHub(
  db: Db,
  input: { githubId: string; login: string },
): Promise<Account> {
  if (isReservedSlug(input.login)) throw new ReservedLoginError(input.login);

  const byGithub = await getAccountByGithubId(db, input.githubId);
  if (byGithub) return byGithub;

  const bySlug = await getAccountBySlug(db, input.login);
  if (bySlug) {
    if (bySlug.githubId === null) {
      const [updated] = await db
        .update(accounts)
        .set({ githubId: input.githubId })
        .where(eq(accounts.id, bySlug.id))
        .returning();
      return updated;
    }
    if (bySlug.githubId !== input.githubId) throw new SlugConflictError(input.login);
    return bySlug;
  }

  return createAccount(db, { username: input.login, githubId: input.githubId, role: "user" });
}

export async function setAccountRole(
  db: Db,
  username: string,
  role: "user" | "admin",
): Promise<Account> {
  const [row] = await db
    .update(accounts)
    .set({ role })
    .where(eq(accounts.username, username))
    .returning();
  if (!row) throw new Error(`no account '${username}'`);
  return row;
}

export type AccountSummary = {
  id: string;
  username: string;
  githubId: string | null;
  role: "user" | "admin";
  createdAt: Date;
  repoLinked: boolean;
  conversationCount: number;
};

/** Cross-account overview for the super-admin console. */
export async function listAllAccounts(db: Db): Promise<AccountSummary[]> {
  const rows = await db.select().from(accounts).orderBy(desc(accounts.createdAt));

  const convCounts = await db
    .select({ accountId: conversations.accountId, count: sql<number>`count(*)::int` })
    .from(conversations)
    .groupBy(conversations.accountId);
  const countByAccount = new Map(convCounts.map((r) => [r.accountId, r.count]));

  const linked = await db
    .selectDistinct({ accountId: personaSource.accountId })
    .from(personaSource)
    .where(eq(personaSource.status, "ok"));
  const linkedSet = new Set(linked.map((r) => r.accountId));

  return rows.map((a) => ({
    id: a.id,
    username: a.username,
    githubId: a.githubId,
    role: a.role,
    createdAt: a.createdAt,
    repoLinked: linkedSet.has(a.id),
    conversationCount: countByAccount.get(a.id) ?? 0,
  }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/accounts/repo.test.ts` (pure cases) and `RUN_DB_TESTS=1 pnpm vitest run tests/lib/accounts/repo.test.ts` (integration).
Expected: PASS. Then `pnpm typecheck` PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/accounts/errors.ts lib/accounts/repo.ts tests/lib/accounts/repo.test.ts
git commit -m "feat(accounts): github upsert/claim, role setter, and account listing"
```

---

### Task 3: Account sessions + guards (replace password-only auth)

**Files:**
- Modify: `lib/admin/auth.ts`
- Create: `lib/accounts/guard.ts`
- Modify: `app/api/admin/login/route.ts` (mint a root session), delete `app/api/admin/logout/route.ts`
- Modify: `app/api/admin/persona-source/route.ts`, `app/api/admin/analytics/route.ts`, `app/api/admin/questions/[id]/reply/handler.ts`, `app/admin/page.tsx` (swap `isAdminAuthenticated` → `requireRootAdmin`)
- Modify: `components/admin/logout-button.tsx` (logout endpoint), `components/admin/admin-login.tsx` (reload after login still works)
- Modify tests: `tests/lib/admin/auth.test.ts`, `tests/api/admin/persona-source.test.ts`, `tests/app/api/admin/questions/reply/route.test.ts`
- Create test: `tests/lib/accounts/guard.test.ts`

- [ ] **Step 1: Rewrite `tests/lib/admin/auth.test.ts` for the accountId payload**

Replace the whole file:

```ts
import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  SESSION_TTL_MS,
} from "@/lib/admin/auth";

const SECRET = "super-secret-session-key";
const ACCT = "11111111-1111-1111-1111-111111111111";

describe("session tokens", () => {
  it("round-trips a token and returns the accountId", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, SECRET)).toBe(ACCT);
  });

  it("rejects an expired token", () => {
    const exp = 1_000_000;
    const token = createSessionToken(ACCT, exp, SECRET);
    expect(verifySessionToken(token, exp + 1, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    const sig = token.slice(token.lastIndexOf(".") + 1);
    const forged = `${ACCT}.${now + SESSION_TTL_MS * 10}.${sig}`;
    expect(verifySessionToken(forged, now, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    const now = Date.now();
    expect(verifySessionToken("", now, SECRET)).toBeNull();
    expect(verifySessionToken("no-dots", now, SECRET)).toBeNull();
    expect(verifySessionToken("acct.notanumber.sig", now, SECRET)).toBeNull();
  });
});

describe("verifyPassword", () => {
  it("accepts an exact match and rejects mismatches", () => {
    expect(verifyPassword("hunter2", "hunter2")).toBe(true);
    expect(verifyPassword("hunter3", "hunter2")).toBe(false);
    expect(verifyPassword("short", "a-much-longer-password")).toBe(false);
    expect(verifyPassword("", "hunter2")).toBe(false);
  });
});
```

- [ ] **Step 2: Write `tests/lib/accounts/guard.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionAccountId = vi.fn();
const getAccountById = vi.fn();
const getRootAccount = vi.fn();

vi.mock("@/lib/admin/auth", () => ({ getSessionAccountId }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ getAccountById, getRootAccount }));

import {
  canAdminister,
  requireSessionAccount,
  requireSuperAdmin,
  requireRootAdmin,
} from "@/lib/accounts/guard";

const user = { id: "u1", username: "u", githubId: null, role: "user", createdAt: new Date() };
const other = { id: "u2", username: "o", githubId: null, role: "user", createdAt: new Date() };
const admin = { id: "a1", username: "a", githubId: null, role: "admin", createdAt: new Date() };
const root = { id: "r1", username: "root", githubId: null, role: "user", createdAt: new Date() };

beforeEach(() => {
  getSessionAccountId.mockReset();
  getAccountById.mockReset();
  getRootAccount.mockReset();
});

describe("canAdminister", () => {
  it("allows the owner and any super-admin, denies strangers and anonymous", () => {
    expect(canAdminister(user, user)).toBe(true);
    expect(canAdminister(admin, other)).toBe(true);
    expect(canAdminister(user, other)).toBe(false);
    expect(canAdminister(null, user)).toBe(false);
  });
});

describe("requireSessionAccount / requireSuperAdmin / requireRootAdmin", () => {
  it("returns null without a session", async () => {
    getSessionAccountId.mockResolvedValue(null);
    expect(await requireSessionAccount()).toBeNull();
    expect(await requireSuperAdmin()).toBeNull();
    expect(await requireRootAdmin()).toBeNull();
  });

  it("requireSuperAdmin only passes role=admin", async () => {
    getSessionAccountId.mockResolvedValue("u1");
    getAccountById.mockResolvedValue(user);
    expect(await requireSuperAdmin()).toBeNull();
    getSessionAccountId.mockResolvedValue("a1");
    getAccountById.mockResolvedValue(admin);
    expect(await requireSuperAdmin()).toEqual(admin);
  });

  it("requireRootAdmin passes the root owner and super-admins, denies others", async () => {
    getRootAccount.mockResolvedValue(root);
    getSessionAccountId.mockResolvedValue("r1");
    getAccountById.mockResolvedValue(root);
    expect(await requireRootAdmin()).toEqual(root);

    getSessionAccountId.mockResolvedValue("a1");
    getAccountById.mockResolvedValue(admin);
    expect(await requireRootAdmin()).toEqual(admin);

    getSessionAccountId.mockResolvedValue("u1");
    getAccountById.mockResolvedValue(user);
    expect(await requireRootAdmin()).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run tests/lib/admin/auth.test.ts tests/lib/accounts/guard.test.ts`
Expected: FAIL — new `createSessionToken` signature / `@/lib/accounts/guard` missing.

- [ ] **Step 4: Rewrite `lib/admin/auth.ts`**

```ts
/**
 * Account sessions.
 *
 * A signed, expiring `queryme_session` cookie carries the owning account id.
 * The token is `${accountId}.${expiresAt}.${hmac}` keyed by SESSION_SECRET, so
 * rotating the secret invalidates every session. Minted by GitHub OAuth
 * (browser) or the ADMIN_PASSWORD machine login (CLI). This module stays pure
 * (crypto + cookie read only) — account/role lookups live in lib/accounts/guard.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "queryme_session";

/** Session lifetime: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mints a session token for `accountId`, valid until `expiresAt` (epoch ms). */
export function createSessionToken(accountId: string, expiresAt: number, secret: string): string {
  const payload = `${accountId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verifies a session token. Returns the accountId when the signature matches and
 * the token is unexpired; otherwise null. (Account UUIDs contain no dots, so the
 * payload splits cleanly into accountId + expiry.)
 */
export function verifySessionToken(token: string, now: number, secret: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return null;
  const accountId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (!accountId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return accountId;
}

/** Constant-time check of a submitted password (CLI machine login). */
export function verifyPassword(input: string, expected: string): boolean {
  return safeEqual(input, expected);
}

/** Reads + verifies the session cookie, returning the owning account id or null. */
export async function getSessionAccountId(): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, Date.now(), secret);
}
```

- [ ] **Step 5: Write `lib/accounts/guard.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { getSessionAccountId } from "@/lib/admin/auth";
import { getAccountById, getRootAccount } from "@/lib/accounts/repo";
import type { Account } from "@/lib/db/schema";

/** The account that owns the current session, or null. */
export async function requireSessionAccount(): Promise<Account | null> {
  const id = await getSessionAccountId();
  if (!id) return null;
  return getAccountById(getDb(), id);
}

/** True when `session` may administer `target` (its owner, or any super-admin). */
export function canAdminister(session: Account | null, target: Account): boolean {
  return !!session && (session.id === target.id || session.role === "admin");
}

/** The session account when it is a super-admin, else null. */
export async function requireSuperAdmin(): Promise<Account | null> {
  const acct = await requireSessionAccount();
  return acct && acct.role === "admin" ? acct : null;
}

/** The session account when it may administer the root account, else null. */
export async function requireRootAdmin(): Promise<Account | null> {
  const session = await requireSessionAccount();
  if (!session) return null;
  const root = await getRootAccount(getDb());
  if (!root) return null;
  return canAdminister(session, root) ? session : null;
}
```

- [ ] **Step 6: Update `app/api/admin/login/route.ts` to mint a root session**

Replace its auth imports + the cookie-setting block. New imports:

```ts
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  verifyPassword,
} from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { getRootAccountId } from "@/lib/accounts/repo";
```

Replace the success block (after the `verifyPassword` check) with:

```ts
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json({ error: "Sessions are not configured." }, { status: 500 });
  }
  const rootId = await getRootAccountId(getDb());

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(rootId, Date.now() + SESSION_TTL_MS, sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
```

(The existing `secret = process.env.ADMIN_PASSWORD` check and rate-limit stay; `verifyPassword(parsed.data.password, secret)` stays.)

- [ ] **Step 7: Delete `app/api/admin/logout/route.ts` and repoint the logout button**

```bash
git rm app/api/admin/logout/route.ts
```

In `components/admin/logout-button.tsx`, change the fetch URL:

```ts
      await fetch("/api/auth/logout", { method: "POST" });
```

(The `/api/auth/logout` route is created in Task 4; until then the button 404s on click, which is acceptable — no test covers it.)

- [ ] **Step 8: Swap `isAdminAuthenticated` → `requireRootAdmin` in the four surfaces**

`app/api/admin/persona-source/route.ts` — replace the auth import and both checks:

```ts
import { requireRootAdmin } from "@/lib/accounts/guard";
// ...in GET and POST, replace `if (!(await isAdminAuthenticated()))` with:
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

`app/api/admin/analytics/route.ts` — same swap (import `requireRootAdmin`, replace the single check).

`app/api/admin/questions/[id]/reply/handler.ts` — replace the import and the check:

```ts
import { requireRootAdmin } from "@/lib/accounts/guard";
// ...
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

`app/admin/page.tsx` — swap **only** the gate (replace the `isAdminAuthenticated` import + check with `requireRootAdmin`). Everything else stays exactly as today — `loadAdminData(getDb())` keeps its single-arg signature this task and `AdminDashboard` is rendered with no `apiBasePath` prop (both change in Task 5):

```ts
import { requireRootAdmin } from "@/lib/accounts/guard";
// ...inside AdminPage():
  if (!(await requireRootAdmin())) {
    return <AdminLogin />;
  }
  const data = await loadAdminData(getDb());
  return <AdminDashboard data={data} />;
```

`AdminLogin` is still rendered here (its password form still works as the root machine login via `/api/admin/login`); Task 5 turns `/admin` into a redirect to the house per-account admin, and Task 7 replaces it with the super console + deletes `AdminLogin`.

- [ ] **Step 9: Update the two affected route tests**

`tests/api/admin/persona-source.test.ts` — replace every `vi.doMock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => X }))` with a guard mock. For the unauthenticated cases use `requireRootAdmin: async () => null`; for authenticated use `requireRootAdmin: async () => ({ id: "route-test-account-id", role: "admin" })`:

```ts
    vi.doMock("@/lib/accounts/guard", () => ({
      requireRootAdmin: async () => ({ id: "route-test-account-id", role: "admin" }),
    }));
```
(and `requireRootAdmin: async () => null` for the two 401 cases). Keep the existing `@/lib/accounts/root` and `@/lib/persona-source` mocks unchanged.

`tests/app/api/admin/questions/reply/route.test.ts` — replace the auth mock block:

```ts
vi.mock("@/lib/accounts/guard", () => ({
  requireRootAdmin: vi.fn(),
}));
// ...
import { requireRootAdmin } from "@/lib/accounts/guard";
```
and replace each `vi.mocked(isAdminAuthenticated).mockResolvedValue(false|true)` with
`vi.mocked(requireRootAdmin).mockResolvedValue(null)` (unauthorized) or
`vi.mocked(requireRootAdmin).mockResolvedValue({ id: "acct", role: "admin" } as never)` (authorized).

- [ ] **Step 10: Run the suite + typecheck**

Run: `pnpm vitest run` then `pnpm typecheck`
Expected: PASS. (The CLI tests in `tests/scripts/**` are unaffected — `/api/admin/login` + `/api/admin/persona-source` still exist.)

- [ ] **Step 11: Commit**

```bash
git add lib/admin/auth.ts lib/accounts/guard.ts app/api/admin app/admin components/admin/logout-button.tsx tests
git commit -m "feat(auth): account sessions + guards; password login mints a root session"
```

---

### Task 4: GitHub OAuth login, callback, logout, and error page

**Files:**
- Create: `lib/auth/github.ts`, `lib/auth/oauth-state.ts`
- Create: `app/api/auth/github/login/route.ts`, `app/api/auth/github/callback/route.ts`, `app/api/auth/logout/route.ts`
- Create: `app/auth/error/page.tsx`
- Modify: `lib/accounts/slug.ts` (reserve `auth`)
- Create tests: `tests/lib/auth/github.test.ts`, `tests/lib/auth/oauth-state.test.ts`, `tests/app/api/auth/callback.test.ts`
- Modify test: `tests/lib/accounts/slug.test.ts`

- [ ] **Step 1: Write the unit tests for the seam + state + slug**

```ts
// tests/lib/auth/oauth-state.test.ts
import { describe, it, expect } from "vitest";
import { createState, verifyState, constantTimeEqual } from "@/lib/auth/oauth-state";

const SECRET = "state-secret";

describe("oauth state", () => {
  it("round-trips a fresh state", () => {
    const now = Date.now();
    const s = createState(SECRET, now);
    expect(verifyState(s, now + 1000, SECRET)).toBe(true);
  });
  it("rejects an expired or tampered or wrong-secret state", () => {
    const now = Date.now();
    const s = createState(SECRET, now);
    expect(verifyState(s, now + 11 * 60 * 1000, SECRET)).toBe(false);
    expect(verifyState(s, now, "other")).toBe(false);
    expect(verifyState(s + "x", now, SECRET)).toBe(false);
  });
  it("constantTimeEqual compares", () => {
    expect(constantTimeEqual("ab", "ab")).toBe(true);
    expect(constantTimeEqual("ab", "ac")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
  });
});
```

```ts
// tests/lib/auth/github.test.ts
import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl } from "@/lib/auth/github";

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, read:user scope and state", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st" }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x/cb");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toBe("st");
  });
});
```

Add to `tests/lib/accounts/slug.test.ts` inside the `isReservedSlug` describe:

```ts
    expect(isReservedSlug("auth")).toBe(true);
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/lib/auth tests/lib/accounts/slug.test.ts`
Expected: FAIL — modules missing / `auth` not reserved.

- [ ] **Step 3: Reserve `auth` in `lib/accounts/slug.ts`**

```ts
export const RESERVED_SLUGS = new Set<string>([
  "about", "cv", "admin", "api", "auth", "login", "signup",
  "_next", "sitemap.xml", "favicon.ico", "robots.txt",
]);
```

- [ ] **Step 4: Write `lib/auth/oauth-state.ts`**

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A signed, short-lived CSRF state: `${nonce}.${expiry}.${hmac}`. */
export function createState(secret: string, now: number = Date.now()): string {
  const payload = `${randomBytes(16).toString("base64url")}.${now + STATE_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyState(state: string, now: number, secret: string): boolean {
  const lastDot = state.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = state.slice(0, lastDot);
  const signature = state.slice(lastDot + 1);
  if (!constantTimeEqual(signature, sign(payload, secret))) return false;
  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return false;
  const expiry = Number(payload.slice(sep + 1));
  return Number.isFinite(expiry) && expiry > now;
}
```

- [ ] **Step 5: Write `lib/auth/github.ts`**

```ts
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export type GitHubUser = { id: number; login: string };

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", "read:user");
  u.searchParams.set("state", opts.state);
  return u.toString();
}

/** Exchanges an OAuth `code` for an access token. Throws on failure. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new Error(`github token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`github token exchange: ${data.error ?? "no token"}`);
  return data.access_token;
}

/** Fetches the authenticated user's id + login. Throws on failure. */
export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "queryme",
    },
  });
  if (!res.ok) throw new Error(`github /user failed: ${res.status}`);
  const data = (await res.json()) as { id: number; login: string };
  return { id: data.id, login: data.login };
}
```

- [ ] **Step 6: Write the three routes + the error page**

```ts
// app/api/auth/github/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/auth/github";
import { createState } from "@/lib/auth/oauth-state";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const origin = req.nextUrl.origin;
  if (!clientId || !secret) {
    return NextResponse.redirect(new URL("/auth/error?reason=not_configured", origin));
  }
  const state = createState(secret);
  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: `${origin}/api/auth/github/callback`,
    state,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("queryme_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
```

```ts
// app/api/auth/github/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchGitHubUser } from "@/lib/auth/github";
import { verifyState, constantTimeEqual } from "@/lib/auth/oauth-state";
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { upsertAccountFromGitHub } from "@/lib/accounts/repo";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, origin));

  const secret = process.env.SESSION_SECRET;
  if (!secret) return fail("not_configured");

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail("denied");

  const code = sp.get("code");
  const state = sp.get("state");
  const cookieState = req.cookies.get("queryme_oauth_state")?.value;
  if (
    !code ||
    !state ||
    !cookieState ||
    !constantTimeEqual(state, cookieState) ||
    !verifyState(state, Date.now(), secret)
  ) {
    return fail("bad_state");
  }

  let login: string;
  let githubId: string;
  try {
    const token = await exchangeCodeForToken(code);
    const user = await fetchGitHubUser(token); // token used only here, then dropped
    login = user.login;
    githubId = String(user.id);
  } catch {
    return fail("github");
  }

  let account;
  try {
    account = await upsertAccountFromGitHub(getDb(), { githubId, login });
  } catch (err) {
    if (err instanceof ReservedLoginError) return fail("reserved");
    if (err instanceof SlugConflictError) return fail("conflict");
    return fail("server");
  }

  const res = NextResponse.redirect(new URL(`/${account.username}/admin`, origin));
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(account.id, Date.now() + SESSION_TTL_MS, secret),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  );
  res.cookies.set("queryme_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}
```

```ts
// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
```

```tsx
// app/auth/error/page.tsx
import Link from "next/link";

const MESSAGES: Record<string, string> = {
  not_configured: "Sign-in isn't configured on this deployment yet.",
  denied: "You declined the GitHub authorization.",
  bad_state: "The sign-in request expired or was tampered with. Please try again.",
  github: "We couldn't reach GitHub to verify your identity. Please try again.",
  reserved: "That GitHub username is reserved and can't be used for an account.",
  conflict: "That username is already linked to a different GitHub account.",
  server: "Something went wrong creating your account. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ""] ?? "Sign-in failed. Please try again.";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-xl text-[var(--color-text-primary)]">Sign-in failed</h1>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">{message}</p>
      <Link
        href="/"
        className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 7: Write the callback route test**

```ts
// tests/app/api/auth/callback.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createState } from "@/lib/auth/oauth-state";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";

const exchangeCodeForToken = vi.fn();
const fetchGitHubUser = vi.fn();
const upsertAccountFromGitHub = vi.fn();

vi.mock("@/lib/auth/github", () => ({ exchangeCodeForToken, fetchGitHubUser }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ upsertAccountFromGitHub }));

const SECRET = "test-session-secret";

function callbackReq(params: Record<string, string>, cookieState?: string): NextRequest {
  const u = new URL("http://localhost/api/auth/github/callback");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (cookieState) headers.cookie = `queryme_oauth_state=${cookieState}`;
  return new NextRequest(u, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = SECRET;
});

describe("GET /api/auth/github/callback", () => {
  it("provisions an account and sets the session cookie on success", async () => {
    const state = createState(SECRET);
    exchangeCodeForToken.mockResolvedValue("tok");
    fetchGitHubUser.mockResolvedValue({ id: 42, login: "octocat" });
    upsertAccountFromGitHub.mockResolvedValue({ id: "acct-1", username: "octocat" });

    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackReq({ code: "c", state }, state));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/octocat/admin");
    expect(res.headers.get("set-cookie")).toContain("queryme_session=");
    expect(upsertAccountFromGitHub).toHaveBeenCalledWith({}, { githubId: "42", login: "octocat" });
  });

  it("redirects to the error page on state mismatch", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackReq({ code: "c", state: "x" }, "y"));
    expect(res.headers.get("location")).toContain("/auth/error?reason=bad_state");
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("maps denied consent and reserved/conflict provisioning errors", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");

    const denied = await GET(callbackReq({ error: "access_denied" }));
    expect(denied.headers.get("location")).toContain("reason=denied");

    const state = createState(SECRET);
    exchangeCodeForToken.mockResolvedValue("tok");
    fetchGitHubUser.mockResolvedValue({ id: 7, login: "api" });
    upsertAccountFromGitHub.mockRejectedValueOnce(new ReservedLoginError("api"));
    const reserved = await GET(callbackReq({ code: "c", state }, state));
    expect(reserved.headers.get("location")).toContain("reason=reserved");

    upsertAccountFromGitHub.mockRejectedValueOnce(new SlugConflictError("octocat"));
    const state2 = createState(SECRET);
    const conflict = await GET(callbackReq({ code: "c", state: state2 }, state2));
    expect(conflict.headers.get("location")).toContain("reason=conflict");
  });
});
```

> Note on redirect status: `NextResponse.redirect` defaults to **307**. If your Next version emits 302/308, assert `res.status >= 300 && res.status < 400` instead.

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm vitest run tests/lib/auth tests/app/api/auth tests/lib/accounts/slug.test.ts` then `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/auth app/api/auth app/auth lib/accounts/slug.ts tests/lib/auth tests/app/api/auth tests/lib/accounts/slug.test.ts
git commit -m "feat(auth): GitHub OAuth login/callback/logout + error page"
```

---

### Task 5: Account-scope the admin read model + per-account admin page + namespaced content/analytics APIs

**Files:**
- Modify: `lib/admin/data.ts` (`loadAdminData(db, accountId)`)
- Create: `lib/admin/persona-source-api.ts`, `lib/admin/analytics-api.ts`
- Modify: `app/api/admin/persona-source/route.ts` (use shared api), delete `app/api/admin/analytics/route.ts`
- Create: `app/api/a/[username]/admin/persona-source/route.ts`, `app/api/a/[username]/admin/analytics/route.ts`
- Create: `app/[username]/admin/page.tsx`
- Modify: `components/admin/admin-dashboard.tsx`, `components/admin/content-tab.tsx` (thread `apiBasePath`)
- Modify: `app/admin/page.tsx` (pass account id + `apiBasePath="/api/admin"`)
- Modify tests: `tests/components/admin/content-tab.test.tsx`
- Create tests: `tests/app/api/a/persona-source.test.ts`, `tests/app/username-admin.test.ts`, `tests/lib/admin/data.test.ts` (account filter case)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/app/username-admin.test.ts — the per-account admin gate
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSessionAccount };
});

beforeEach(() => {
  loadAccountForSlug.mockReset();
  requireSessionAccount.mockReset();
});

describe("resolveAccountAdmin", () => {
  it("returns notFound for an unknown slug", async () => {
    loadAccountForSlug.mockResolvedValue(null);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("nope")).toEqual({ kind: "not-found" });
  });
  it("returns login-required without a session", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue(null);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "login" });
  });
  it("returns not-found for a logged-in stranger", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "b", username: "bob", role: "user" });
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "not-found" });
  });
  it("returns ok for the owner and for a super-admin", async () => {
    const acct = { id: "a", username: "alex", role: "user" };
    loadAccountForSlug.mockResolvedValue(acct);
    requireSessionAccount.mockResolvedValue(acct);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "ok", account: acct });

    requireSessionAccount.mockResolvedValue({ id: "z", username: "z", role: "admin" });
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "ok", account: acct });
  });
});
```

```ts
// tests/app/api/a/persona-source.test.ts — per-account content API guard
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSessionAccount };
});
vi.mock("@/lib/admin/persona-source-api", () => ({
  personaSourceStatus: async () => ({ active: null, history: [] }),
  personaSourceSync: vi.fn(),
}));

const params = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  loadAccountForSlug.mockReset();
  requireSessionAccount.mockReset();
});

describe("GET /api/a/[username]/admin/persona-source", () => {
  it("404s for an unknown account", async () => {
    loadAccountForSlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("nope"));
    expect(res.status).toBe(404);
  });
  it("404s for a logged-in stranger", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "b", username: "bob", role: "user" });
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("alex"));
    expect(res.status).toBe(404);
  });
  it("returns status for the owner", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("alex"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: null, history: [] });
  });
});
```

Add to `tests/lib/admin/data.test.ts` a pure shaping assertion is already covered; add an account-filter integration test (guarded):

```ts
import { eq } from "drizzle-orm";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("loadAdminData (account filter, integration)", () => {
  it("returns only the given account's conversations", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { getOrCreateConversation } = await import("@/lib/conversations/repo");
    const { loadAdminData } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const a = await createAccount(db, { username: `dataf-a-${Date.now()}` });
    const b = await createAccount(db, { username: `dataf-b-${Date.now()}` });
    const ca = randomUUID();
    await getOrCreateConversation(db, { id: ca, channel: "chat", accountId: a.id });
    try {
      const data = await loadAdminData(db, a.id);
      expect(data.conversations.some((c) => c.id === ca)).toBe(true);
      const dataB = await loadAdminData(db, b.id);
      expect(dataB.conversations.some((c) => c.id === ca)).toBe(false);
    } finally {
      await db.delete(conversations).where(eq(conversations.id, ca));
      await db.delete(accounts).where(eq(accounts.id, a.id));
      await db.delete(accounts).where(eq(accounts.id, b.id));
    }
  });
});
```

(Ensure `tests/lib/admin/data.test.ts` imports `describe, it, expect` from vitest — they're globals here, so no import is strictly needed; keep consistent with the file's existing style.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/app/username-admin.test.ts tests/app/api/a/persona-source.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Account-scope `loadAdminData`**

In `lib/admin/data.ts`, add imports and replace `loadAdminData`:

```ts
import { desc, eq } from "drizzle-orm";
// ...existing imports of conversations, forwardedQuestions...

export async function loadAdminData(db: Db, accountId: string): Promise<AdminData> {
  const [convs, qRows] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(CONVERSATION_LIMIT),
    db
      .select({ q: forwardedQuestions })
      .from(forwardedQuestions)
      .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
      .where(eq(conversations.accountId, accountId))
      .orderBy(desc(forwardedQuestions.createdAt)),
  ]);
  return buildAdminData(convs, qRows.map((r) => r.q));
}
```

- [ ] **Step 4: Write the shared content + analytics api modules**

```ts
// lib/admin/persona-source-api.ts
import {
  getActivePersonaSourceRowForAccount,
  listSyncHistoryForAccount,
  syncFromGitHubForAccount,
  type SyncResult,
} from "@/lib/persona-source";

export async function personaSourceStatus(accountId: string) {
  const [active, history] = await Promise.all([
    getActivePersonaSourceRowForAccount(accountId),
    listSyncHistoryForAccount(accountId, 10),
  ]);
  return { active, history };
}

export async function personaSourceSync(
  accountId: string,
  repoUrl: string,
  branch?: string,
): Promise<SyncResult> {
  return syncFromGitHubForAccount(accountId, repoUrl, branch);
}
```

```ts
// lib/admin/analytics-api.ts
import { desc, eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { conversations, forwardedQuestions } from "@/lib/db/schema";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

type Db = ReturnType<typeof getDb>;

export async function getAnalytics(db: Db, accountId: string, now: Date = new Date()) {
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.lastMessageAt));
  const qs = await db
    .select({ q: forwardedQuestions })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(conversations.accountId, accountId));
  const questionRows = qs.map((r) => r.q);
  return {
    perDay: conversationsPerDay(convs, 30, now),
    topics: topQuestionTopics(questionRows),
    density: convs
      .map((c) => citationDensityPerConversation({ id: c.id, transcript: c.transcript ?? [] }))
      .filter((dd) => dd.assistantTurns > 0)
      .sort((x, y) => x.avgCitations - y.avgCitations),
  };
}
```

- [ ] **Step 5: Refactor the root persona-source route + delete the root analytics route**

Replace `app/api/admin/persona-source/route.ts` body to use the shared api + `requireRootAdmin` (already swapped in Task 3) + `resolveRootAccountId`:

```ts
import { NextResponse } from "next/server";
import { requireRootAdmin } from "@/lib/accounts/guard";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await personaSourceStatus(await resolveRootAccountId()));
}

export async function POST(req: Request) {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repoUrl) return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  const result = await personaSourceSync(await resolveRootAccountId(), body.repoUrl, body.branch);
  if (result.kind === "error") return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ commitSha: result.commitSha, syncedAt: result.syncedAt });
}
```

> The existing `tests/api/admin/persona-source.test.ts` mocks `@/lib/persona-source` (which `persona-source-api` re-exports through) and `@/lib/accounts/root` + `@/lib/accounts/guard` — it stays valid. Run it to confirm.

Delete the root analytics route (moved to per-account):

```bash
git rm app/api/admin/analytics/route.ts
```

- [ ] **Step 6: Create the per-account routes + the per-account admin page**

```ts
// app/[username]/admin/resolve.ts
import { loadAccountForSlug } from "@/lib/accounts/load";
import { requireSessionAccount, canAdminister } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

export type AdminResolution =
  | { kind: "not-found" }
  | { kind: "login" }
  | { kind: "ok"; account: Account };

/** Shared gate for the per-account admin page + APIs. */
export async function resolveAccountAdmin(slug: string): Promise<AdminResolution> {
  const account = await loadAccountForSlug(slug);
  if (!account) return { kind: "not-found" };
  const session = await requireSessionAccount();
  if (!session) return { kind: "login" };
  if (!canAdminister(session, account)) return { kind: "not-found" };
  return { kind: "ok", account };
}
```

```tsx
// app/[username]/admin/page.tsx
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { loadAdminData } from "@/lib/admin/data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { resolveAccountAdmin } from "./resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountAdminPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");

  const data = await loadAdminData(getDb(), res.account.id);
  return <AdminDashboard data={data} apiBasePath={`/api/a/${res.account.username}/admin`} />;
}
```

```ts
// app/api/a/[username]/admin/persona-source/route.ts
import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await personaSourceStatus(res.account.id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repoUrl) return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  const result = await personaSourceSync(res.account.id, body.repoUrl, body.branch);
  if (result.kind === "error") return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ commitSha: result.commitSha, syncedAt: result.syncedAt });
}
```

```ts
// app/api/a/[username]/admin/analytics/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getAnalytics } from "@/lib/admin/analytics-api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await getAnalytics(getDb(), res.account.id));
}
```

- [ ] **Step 7: Thread `apiBasePath` through the dashboard + content tab**

In `components/admin/admin-dashboard.tsx`:
- Change the signature: `export function AdminDashboard({ data, apiBasePath }: { data: AdminData; apiBasePath: string })`.
- Pass it down: `{tab === "content" && <ContentTab apiBasePath={apiBasePath} />}`.
- In `AnalyticsPanel`, accept `apiBasePath` and fetch `${apiBasePath}/analytics` (change the component to `function AnalyticsPanel({ apiBasePath }: { apiBasePath: string })` and render `<AnalyticsPanel apiBasePath={apiBasePath} />`).
- In `QuestionDetail`, accept `apiBasePath` and POST `${apiBasePath}/questions/${question.id}/reply` (thread `apiBasePath` from `AdminDashboard` → the `DetailSidebar` `QuestionDetail` usage).

In `components/admin/content-tab.tsx`:
- Change the signature to `export function ContentTab({ apiBasePath }: { apiBasePath: string })`.
- Replace the three `fetch("/api/admin/persona-source"...)` calls with `fetch(\`${apiBasePath}/persona-source\`...)`.

In `app/admin/page.tsx`: `AdminDashboard` now **requires** `apiBasePath`, so the Task-3 root render no longer type-checks. Rather than wire a root dashboard that depends on the just-deleted `/api/admin/analytics`, replace the page body with a redirect to the house account's per-account admin (Task 7 turns it into the super console):

```tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function AdminPage() {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  redirect(username ? `/${username}/admin` : "/api/auth/github/login");
}
```

Delete the now-unused imports (`isAdminAuthenticated`/`requireRootAdmin`, `loadAdminData`, `getDb`, `AdminDashboard`, `AdminLogin`, `Metadata`) from this file. The house admin now lives at `/{ROOT_ACCOUNT_USERNAME}/admin` and uses the working namespaced routes; the CLI still hits `/api/admin/persona-source` directly.

- [ ] **Step 8: Update `tests/components/admin/content-tab.test.tsx`**

Render `<ContentTab apiBasePath="/api/a/alex/admin" />` and update the asserted URL from `"/api/admin/persona-source"` to `"/api/a/alex/admin/persona-source"`.

- [ ] **Step 9: Run the suite + typecheck**

Run: `pnpm vitest run` then `pnpm typecheck`
Expected: PASS (DB-filter test skips without `RUN_DB_TESTS`). Optionally `RUN_DB_TESTS=1 pnpm vitest run tests/lib/admin/data.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add lib/admin app/api/admin app/api/a app/[username]/admin app/admin/page.tsx components/admin tests
git commit -m "feat(admin): per-account admin page + namespaced content/analytics APIs"
```

---

### Task 6: Per-account forwarded-question replies (namespaced + ownership)

**Files:**
- Create: `lib/questions/account.ts` (`getQuestionAccountId`)
- Modify: `app/api/admin/questions/[id]/reply/handler.ts` (drop its own auth check; keep reply logic)
- Create: `app/api/a/[username]/admin/questions/[id]/reply/route.ts`
- Delete: `app/api/admin/questions/[id]/reply/route.ts` only (the root reply **route**) — **keep** `handler.ts` in that folder; the per-account route imports it
- Modify tests: `tests/app/api/admin/questions/reply/route.test.ts` (handler no longer authorizes)
- Create test: `tests/app/api/a/questions-reply.test.ts`

- [ ] **Step 1: Write the failing tests**

Update `tests/app/api/admin/questions/reply/route.test.ts`:
- Remove the `@/lib/accounts/guard` mock and the import of `requireRootAdmin`.
- Delete the "returns 401 when unauthenticated" case (auth now lives in the route, not the handler).
- The remaining cases call `handleReply(req, ctx, deps)` directly and should pass (they already mock `getQuestion`/`recordReply`). Keep them.

New per-account route test:

```ts
// tests/app/api/a/questions-reply.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const resolveAccountAdmin = vi.fn();
const getQuestionAccountId = vi.fn();
const handleReply = vi.fn();

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/questions/account", () => ({ getQuestionAccountId }));
vi.mock("@/app/api/admin/questions/[id]/reply/handler", () => ({ handleReply }));

const ctx = (username: string, id: string) => ({
  params: Promise.resolve({ username, id }),
});
function req(): NextRequest {
  return new NextRequest("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reply: "hi" }),
  });
}

beforeEach(() => {
  resolveAccountAdmin.mockReset();
  getQuestionAccountId.mockReset();
  handleReply.mockReset();
});

describe("POST /api/a/[username]/admin/questions/[id]/reply", () => {
  it("404s when the caller can't administer the account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(404);
    expect(handleReply).not.toHaveBeenCalled();
  });

  it("404s when the question belongs to another account (IDOR guard)", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "acct-a", username: "alex" } });
    getQuestionAccountId.mockResolvedValue("acct-b");
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(404);
    expect(handleReply).not.toHaveBeenCalled();
  });

  it("delegates to handleReply when authorized and owned", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "acct-a", username: "alex" } });
    getQuestionAccountId.mockResolvedValue("acct-a");
    handleReply.mockResolvedValue(new Response(null, { status: 200 }));
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(200);
    expect(handleReply).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/app/api/a/questions-reply.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Add `getQuestionAccountId`**

```ts
// lib/questions/account.ts
import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { forwardedQuestions, conversations } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** The account that owns a forwarded question (via its conversation), or null. */
export async function getQuestionAccountId(db: Db, questionId: string): Promise<string | null> {
  const [row] = await db
    .select({ accountId: conversations.accountId })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(forwardedQuestions.id, questionId))
    .limit(1);
  return row?.accountId ?? null;
}
```

- [ ] **Step 4: Strip the auth check from `handleReply`**

In `app/api/admin/questions/[id]/reply/handler.ts`, remove the `requireRootAdmin` import and the guard block (the first `if (!(await requireRootAdmin())) ...`). The handler now assumes the caller authorized; it keeps JSON parsing, validation, `getQuestion`, `recordReply`, and email.

- [ ] **Step 5: Create the per-account reply route + delete the root one**

```ts
// app/api/a/[username]/admin/questions/[id]/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getQuestionAccountId } from "@/lib/questions/account";
import { getDb } from "@/lib/db/client";
import { resendTransport } from "@/lib/notify/email";
import { handleReply } from "@/app/api/admin/questions/[id]/reply/handler";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = await getQuestionAccountId(getDb(), id);
  if (owner !== res.account.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return handleReply(req, { params: Promise.resolve({ id }) }, {
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}
```

```bash
git rm "app/api/admin/questions/[id]/reply/route.ts"
```

(Keep `app/api/admin/questions/[id]/reply/handler.ts` — it is now imported only by the per-account route. Its folder no longer has a `route.ts`, so Next.js exposes no root `/api/admin/questions/...` endpoint.)

- [ ] **Step 6: Run the suite + typecheck**

Run: `pnpm vitest run` then `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/questions/account.ts app/api/a app/api/admin/questions tests
git commit -m "feat(admin): per-account forwarded-question replies with ownership guard"
```

---

### Task 7: Super-admin console at `/admin` + remove the browser password UI

**Files:**
- Create: `components/admin/account-list.tsx`
- Modify: `app/admin/page.tsx` (super console)
- Delete: `components/admin/admin-login.tsx`
- Create test: `tests/app/admin-super.test.ts`, `tests/components/admin/account-list.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/app/admin-super.test.ts — the super console gate
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSuperAdmin = vi.fn();
const listAllAccounts = vi.fn();

vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSuperAdmin };
});
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ listAllAccounts }));

beforeEach(() => {
  requireSuperAdmin.mockReset();
  listAllAccounts.mockReset();
});

describe("loadSuperConsole", () => {
  it("returns null for non-super callers", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { loadSuperConsole } = await import("@/app/admin/load");
    expect(await loadSuperConsole()).toBeNull();
  });
  it("returns the account list for a super-admin", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "a", role: "admin" });
    listAllAccounts.mockResolvedValue([{ username: "x", role: "user" }]);
    const { loadSuperConsole } = await import("@/app/admin/load");
    const result = await loadSuperConsole();
    expect(result?.accounts).toHaveLength(1);
  });
});
```

```tsx
// tests/components/admin/account-list.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountList } from "@/components/admin/account-list";

describe("AccountList", () => {
  it("renders a row per account with a link to its admin", () => {
    render(
      <AccountList
        accounts={[
          {
            id: "1",
            username: "alex",
            githubId: "42",
            role: "user",
            createdAt: new Date("2026-01-01"),
            repoLinked: true,
            conversationCount: 3,
          },
        ]}
      />,
    );
    expect(screen.getByText("alex")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /alex/i });
    expect(link).toHaveAttribute("href", "/alex/admin");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/app/admin-super.test.ts tests/components/admin/account-list.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write `app/admin/load.ts` + `components/admin/account-list.tsx`**

```ts
// app/admin/load.ts
import { getDb } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/accounts/guard";
import { listAllAccounts, type AccountSummary } from "@/lib/accounts/repo";

export async function loadSuperConsole(): Promise<{ accounts: AccountSummary[] } | null> {
  const su = await requireSuperAdmin();
  if (!su) return null;
  return { accounts: await listAllAccounts(getDb()) };
}
```

```tsx
// components/admin/account-list.tsx
import Link from "next/link";
import type { AccountSummary } from "@/lib/accounts/repo";

const TH = "py-2 pr-4 text-left font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const TD = "py-2 pr-4 text-[13px] text-[var(--color-text-secondary)]";

export function AccountList({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className={TH}>Username</th>
          <th className={TH}>GitHub id</th>
          <th className={TH}>Role</th>
          <th className={TH}>Repo</th>
          <th className={TH}>Convos</th>
          <th className={TH}>Created</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map((a) => (
          <tr key={a.id} className="border-b border-[var(--color-border)]/40">
            <td className={TD}>
              <Link href={`/${a.username}/admin`} className="text-[var(--color-primary)] hover:underline">
                {a.username}
              </Link>
            </td>
            <td className={TD}>{a.githubId ?? "—"}</td>
            <td className={TD}>{a.role}</td>
            <td className={TD}>{a.repoLinked ? "linked" : "—"}</td>
            <td className={TD}>{a.conversationCount}</td>
            <td className={TD}>{new Date(a.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Repurpose `app/admin/page.tsx` as the super console**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountList } from "@/components/admin/account-list";
import { loadSuperConsole } from "./load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform admin — queryme",
  robots: { index: false, follow: false },
};

export default async function SuperAdminPage() {
  const result = await loadSuperConsole();
  if (!result) notFound();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 font-display text-xl text-[var(--color-text-primary)]">Accounts</h1>
      <AccountList accounts={result.accounts} />
    </main>
  );
}
```

- [ ] **Step 5: Delete the browser password component**

```bash
git rm components/admin/admin-login.tsx
```

(Confirm nothing else imports it: `grep -rn "admin-login" app components` should return nothing.)

- [ ] **Step 6: Run the suite + typecheck + build**

Run: `pnpm vitest run` then `pnpm typecheck` then `pnpm build`
Expected: PASS. (`/admin` is now the super console; per-account admin is at `/{username}/admin`; the browser has no password form.)

- [ ] **Step 7: Commit**

```bash
git add app/admin components/admin tests
git commit -m "feat(admin): super-admin console at /admin; remove browser password UI"
```

---

### Task 8: CLI `account promote|demote`, backfill seed, landing wiring, env/docs, final verification

**Files:**
- Modify: `scripts/lib/admin-args.ts`, `scripts/lib/admin-run.ts`
- Modify: `scripts/backfill-root-account.ts`
- Modify: `components/landing/landing-page.tsx`
- Modify: `.env.example`, `README.md`
- Modify tests: `tests/scripts/lib/admin-args.test.ts`, `tests/scripts/lib/admin-run.test.ts`, the landing render test

- [ ] **Step 1: Write the failing CLI + landing tests**

Add to `tests/scripts/lib/admin-args.test.ts`:

```ts
it("parses `account promote <username>`", () => {
  const p = parseAdminArgs(["account", "promote", "alex"]);
  expect(p.kind).toBe("ok");
  if (p.kind !== "ok") return;
  expect(p.parsed).toMatchObject({ command: "account", sub: "promote", username: "alex" });
});
it("parses `account demote <username>`", () => {
  const p = parseAdminArgs(["account", "demote", "alex"]);
  expect(p.kind).toBe("ok");
  if (p.kind !== "ok") return;
  expect(p.parsed).toMatchObject({ command: "account", sub: "demote", username: "alex" });
});
```

Add to `tests/scripts/lib/admin-run.test.ts` (follow the file's existing mocking conventions for `@/lib/db/client` + `@/lib/accounts/repo`; mock `setAccountRole` to echo an account):

```ts
it("promotes an account to admin", async () => {
  // Reuse this file's DB/repo mocking pattern; setAccountRole returns an admin row.
  const out = await run(["account", "promote", "alex", "--json"], { env: { POSTGRES_URL: "x" }, isTTY: false });
  expect(out.exitCode).toBe(0);
  expect(JSON.parse(out.stdout)).toMatchObject({ ok: true, account: "alex", role: "admin" });
});
```

In `tests/components/landing/landing-page.test.tsx`, replace the first test (the "renders the concept hero and a disabled coming-soon sign-in" case, which asserts a disabled `button`) with a live-link assertion; keep the heading check and the second "See it live" test as-is:

```ts
  it("renders the concept hero and a live GitHub sign-in link", () => {
    render(<LandingPage seeItLiveUsername="Miawousha" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: /sign in with github/i });
    expect(signIn).toHaveAttribute("href", "/api/auth/github/login");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/scripts/lib/admin-args.test.ts tests/scripts/lib/admin-run.test.ts`
Expected: FAIL — `promote`/`demote` not recognized.

- [ ] **Step 3: Extend the CLI parser**

In `scripts/lib/admin-args.ts`, widen the `account` member of `ParsedCommand`:

```ts
  | {
      command: "account";
      sub: "create" | "link" | "promote" | "demote";
      username: string;
      repoUrl?: string;
      branch?: string;
      outputFlag?: OutputMode;
    };
```

In the `case "account":` block, add handling before the final fallback:

```ts
      if (sub === "promote" || sub === "demote") {
        const username = rest[1];
        if (!username) return usage(`usage: admin account ${sub} <username>`);
        if (rest.length > 2) return usage(`unexpected argument: ${rest[2]}`);
        return { kind: "ok", parsed: { command: "account", sub, username, outputFlag } };
      }
```

and update the final fallback message:

```ts
      return usage("usage: admin account <create|link|promote|demote> ...");
```

- [ ] **Step 4: Extend the CLI handler + MANIFEST**

In `scripts/lib/admin-run.ts`, import `setAccountRole`:

```ts
import { createAccount, getAccountBySlug, getRootAccountId, setAccountRole } from "@/lib/accounts/repo";
```

In `handleAccount`, add before the `// link` branch a promote/demote branch:

```ts
  if (cmd.sub === "promote" || cmd.sub === "demote") {
    const role = cmd.sub === "promote" ? "admin" : "user";
    const acct = await setAccountRole(db, cmd.username, role);
    return {
      result: { ok: true, account: acct.username, role: acct.role },
      pretty: `${cmd.sub}d ${acct.username} -> ${acct.role}`,
    };
  }
```

Update the `account` MANIFEST entry usage/summary:

```ts
      summary: "Manage accounts: create, link a content repo, or set super-admin role.",
      usage: "admin account <create|link|promote|demote> <username> [repoUrl] [--branch <name>] [--json|--pretty]",
```

- [ ] **Step 5: Seed the super-admin in the backfill**

In `scripts/backfill-root-account.ts`, after the root account is created/fetched and before the row backfills, set its role:

```ts
import { setAccountRole } from "@/lib/accounts/repo";
// ...after `root` is resolved:
  if (root.role !== "admin") {
    await setAccountRole(db, root.username, "admin");
  }
```

(`root.role` exists on the `Account` type after Task 1.)

- [ ] **Step 6: Wire the landing button**

In `components/landing/landing-page.tsx`, replace the header's "coming soon" pill + disabled `<button>` (the `<div className="flex items-center gap-2">` block) with a live link:

```tsx
          <a
            href="/api/auth/github/login"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-3.5 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
          >
            <GitHubMark />
            Sign in with GitHub
          </a>
```

- [ ] **Step 7: Update env + docs**

In `.env.example`, under a new "Authentication" section, add:

```
# --- Authentication (GitHub OAuth) ---

# GitHub OAuth app credentials (https://github.com/settings/developers).
# Callback URL: {your site}/api/auth/github/callback
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

# Signs the session + OAuth-state cookies. Rotating it logs everyone out.
# Generate: openssl rand -base64 32
SESSION_SECRET=
```

Update the existing `ADMIN_PASSWORD` comment (it currently sits near the session-cookie note) to state it is now the **CLI-only** machine login for `admin sync/status --remote` (browser admin uses GitHub OAuth). In `README.md`, add a "Sign in / accounts" section documenting: creating the GitHub OAuth app, the three new env vars, first-login auto-provision/claim, `pnpm admin account promote <username>`, and that `/admin` is the super console while `/{username}/admin` is each owner's admin.

- [ ] **Step 8: Full verification**

Run: `pnpm vitest run` then `pnpm typecheck` then `pnpm build`
Expected: all PASS. Then sanity-grep for leftovers:

```bash
grep -rn "isAdminAuthenticated\|ADMIN_COOKIE" app lib components scripts   # expect: no matches
grep -rn "admin-login" app components                                       # expect: no matches
```

- [ ] **Step 9: Commit**

```bash
git add scripts components/landing .env.example README.md tests
git commit -m "feat(accounts): account promote/demote CLI, super-admin seed, live landing login, docs"
```

---

## Manual verification (after Task 8)

1. Create a GitHub OAuth app; set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `SESSION_SECRET` (and keep `ADMIN_PASSWORD`) in `.env.local`. Callback URL: `http://localhost:3000/api/auth/github/callback`.
2. `pnpm db:migrate` then `pnpm backfill:root` (seeds `Miawousha` as `role='admin'`).
3. `pnpm dev`: visit `/` → click **Sign in with GitHub** → authorize → you land on `/{your-login}/admin`. If your login is `Miawousha`, the existing house account is claimed (its `github_id` is now set) and you can manage content at `/Miawousha/admin`.
4. `/admin` shows the super console (account list) for the super-admin; a non-super session 404s.
5. A second GitHub user signing in auto-provisions `/{their-login}` and can only administer their own `/{their-login}/admin` (others 404).
6. CLI still works: `pnpm admin status --remote <url> --remote-password <ADMIN_PASSWORD>` and `pnpm admin sync --remote …`.

## Deferred to later plans (out of scope here)

- Per-account email forwarding + custom-domain config (Plan 3).
- Private KB repos, account deletion/suspension/rename, billing/metering.
- Per-account MCP endpoints (`/api/a/{username}/mcp`).
- Capturing/using the GitHub email (`user:email` scope).

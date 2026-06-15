# Persona Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a persona owner pushes to their content repo, a verified GitHub `push` webhook auto-syncs the live page — opt-in per account from the admin Content tab.

**Architecture:** A public, HMAC-gated route `POST /api/a/[username]/sync-webhook` verifies GitHub's `X-Hub-Signature-256` against a per-account secret stored in a new `persona_auto_sync` table, then invokes the existing `syncFromGitHubForAccount` primitive against the account's **stored** repo + branch (never the payload). A session-gated admin route + `AutoSyncPanel` component let owners enable/disable and reveal the webhook URL + secret. Sync execution is ack-200-then-`after()` so a slow/failed sync never triggers a GitHub retry.

**Tech Stack:** Next.js 15.5 (App Router, `runtime = "nodejs"`, `after` from `next/server`), Drizzle ORM 0.45 + drizzle-kit, Postgres, Vitest + React Testing Library, `node:crypto` for HMAC.

**Spec:** [docs/superpowers/specs/2026-06-15-persona-auto-sync-design.md](../specs/2026-06-15-persona-auto-sync-design.md)

---

## File structure

New files:
- `lib/auto-sync/verify.ts` — pure: `verifySignature`, `decideAction`. No I/O.
- `lib/auto-sync/url.ts` — pure: `webhookUrlFor(username)`.
- `lib/auto-sync/repo.ts` — DB access: `generateSecret`, `getAutoSyncConfig`, `enableAutoSync`, `disableAutoSync`, `regenerateSecret`, `touchLastDelivery`.
- `app/api/a/[username]/sync-webhook/route.ts` — public webhook route.
- `app/api/a/[username]/admin/auto-sync/route.ts` — session-gated admin route.
- `components/admin/auto-sync-panel.tsx` — admin UI.
- Tests mirroring each of the above.

Modified files:
- `lib/db/schema.ts` — add `personaAutoSync` table + `boolean` import.
- `lib/db/migrations/` — generated migration (via `pnpm db:generate`).
- `app/[username]/admin/settings/content/page.tsx` — render `<AutoSyncPanel>`.

---

## Task 1: `persona_auto_sync` schema + migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/00NN_*.sql` (generated)

This task is structural (a Drizzle table + generated migration); it has no unit test — the guard is that the migration generates cleanly and downstream tasks compile against it.

- [ ] **Step 1: Add `boolean` to the pg-core import**

In `lib/db/schema.ts`, the first line is:

```ts
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, date, integer } from "drizzle-orm/pg-core";
```

Change it to add `boolean`:

```ts
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, date, integer, boolean } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Append the `personaAutoSync` table**

Add this at the end of `lib/db/schema.ts` (after the `accountBilling` block):

```ts
/**
 * Per-account auto-sync config. One row per account (unique account_id). This
 * is CONFIG, not history — persona_source stays the append-only sync log. The
 * `secret` is the GitHub webhook HMAC signing secret, generated on first
 * enable and revealed to the owner (like a Stripe endpoint secret). `enabled`
 * pauses delivery handling without destroying the secret, so re-enabling is
 * instant and an already-installed GitHub hook keeps working. `webhook_id` is
 * the seam for a future server-side (OAuth) hook creation: null in manual mode.
 */
export const personaAutoSync = pgTable(
  "persona_auto_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    enabled: boolean("enabled").notNull().default(false),
    secret: text("secret").notNull(),
    webhookId: text("webhook_id"),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("persona_auto_sync_account_unique").on(table.accountId),
  }),
);

export type PersonaAutoSync = typeof personaAutoSync.$inferSelect;
export type NewPersonaAutoSync = typeof personaAutoSync.$inferInsert;
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `lib/db/migrations/00NN_<random>.sql` is created (next index after `0013`), containing `CREATE TABLE "persona_auto_sync"` and `CREATE UNIQUE INDEX "persona_auto_sync_account_unique"`, plus updates under `lib/db/migrations/meta/`.

- [ ] **Step 4: Verify the generated SQL**

Run: `ls lib/db/migrations/ | tail -3 && grep -l "persona_auto_sync" lib/db/migrations/*.sql`
Expected: the new `.sql` file is listed and matches the grep. Open it and confirm it contains the unique index and the FK to `accounts`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (the schema additions compile).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(auto-sync): add persona_auto_sync config table"
```

---

## Task 2: `lib/auto-sync/verify.ts` — signature verify + decision logic

**Files:**
- Create: `lib/auto-sync/verify.ts`
- Test: `tests/lib/auto-sync/verify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auto-sync/verify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, decideAction } from "@/lib/auto-sync/verify";

const SECRET = "test-secret-abc123";

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifySignature", () => {
  const body = JSON.stringify({ ref: "refs/heads/main" });

  it("accepts a correctly signed body", () => {
    expect(verifySignature(SECRET, body, sign(SECRET, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifySignature(SECRET, body + "x", sign(SECRET, body))).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifySignature("other-secret", body, sign(SECRET, body))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifySignature(SECRET, body, null)).toBe(false);
  });

  it("rejects a length-mismatched header without throwing", () => {
    expect(verifySignature(SECRET, body, "sha256=deadbeef")).toBe(false);
  });
});

describe("decideAction", () => {
  const base = { event: "push", ref: "refs/heads/main", enabled: true, branch: "main" };

  it("syncs an eligible push to the stored branch", () => {
    expect(decideAction(base)).toBe("sync");
  });

  it("pongs a ping regardless of enabled", () => {
    expect(decideAction({ ...base, event: "ping", enabled: false })).toBe("pong");
  });

  it("skips when disabled", () => {
    expect(decideAction({ ...base, enabled: false })).toBe("skip");
  });

  it("skips a push to a different branch", () => {
    expect(decideAction({ ...base, ref: "refs/heads/dev" })).toBe("skip");
  });

  it("skips a non-push, non-ping event", () => {
    expect(decideAction({ ...base, event: "issues" })).toBe("skip");
  });

  it("skips when ref is missing", () => {
    expect(decideAction({ ...base, ref: null })).toBe("skip");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/auto-sync/verify.test.ts`
Expected: FAIL — cannot find module `@/lib/auto-sync/verify`.

- [ ] **Step 3: Write the implementation**

Create `lib/auto-sync/verify.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time verification of a GitHub `X-Hub-Signature-256` header against a
 * per-account secret. Returns false (never throws) for a missing header or a
 * length mismatch so the caller can branch on a plain boolean. The body must be
 * the RAW request bytes — re-serializing parsed JSON would change the digest.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = Buffer.from(signatureHeader);
  const want = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths; guard first.
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export type DecideInput = {
  event: string | null; // X-GitHub-Event header
  ref: string | null; // payload.ref, e.g. "refs/heads/main"
  enabled: boolean; // auto-sync enabled for this account
  branch: string; // the account's STORED branch
};

export type Decision = "sync" | "skip" | "pong";

/**
 * Routes a VERIFIED webhook delivery. Pure — no I/O. A `ping` is always
 * acknowledged (pong). Otherwise a sync happens only for a `push` to the
 * stored branch while auto-sync is enabled; everything else is skipped.
 */
export function decideAction(input: DecideInput): Decision {
  if (input.event === "ping") return "pong";
  if (!input.enabled) return "skip";
  if (input.event !== "push") return "skip";
  if (input.ref !== `refs/heads/${input.branch}`) return "skip";
  return "sync";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/auto-sync/verify.test.ts`
Expected: PASS (11 assertions across 2 describes).

- [ ] **Step 5: Commit**

```bash
git add lib/auto-sync/verify.ts tests/lib/auto-sync/verify.test.ts
git commit -m "feat(auto-sync): HMAC signature verify + delivery decision logic"
```

---

## Task 3: `lib/auto-sync/url.ts` — webhook URL builder

**Files:**
- Create: `lib/auto-sync/url.ts`
- Test: `tests/lib/auto-sync/url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auto-sync/url.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { webhookUrlFor } from "@/lib/auto-sync/url";

describe("webhookUrlFor", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("builds an absolute sync-webhook URL for the username", () => {
    expect(webhookUrlFor("alex")).toBe("https://queritae.com/api/a/alex/sync-webhook");
  });

  it("strips a trailing slash on the configured origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com/";
    expect(webhookUrlFor("alex")).toBe("https://queritae.com/api/a/alex/sync-webhook");
  });

  it("url-encodes the username", () => {
    expect(webhookUrlFor("a b")).toBe("https://queritae.com/api/a/a%20b/sync-webhook");
  });

  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(webhookUrlFor("alex")).toBe("http://localhost:3000/api/a/alex/sync-webhook");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/auto-sync/url.test.ts`
Expected: FAIL — cannot find module `@/lib/auto-sync/url`.

- [ ] **Step 3: Write the implementation**

Create `lib/auto-sync/url.ts`:

```ts
/**
 * Site origin for the public webhook URL. Reads NEXT_PUBLIC_SITE_URL (the same
 * env var billing's siteUrl() uses) directly rather than importing it from the
 * billing module, so the auto-sync path never pulls the Stripe module graph.
 */
function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Absolute URL of the per-account GitHub webhook endpoint. */
export function webhookUrlFor(username: string): string {
  return `${siteOrigin()}/api/a/${encodeURIComponent(username)}/sync-webhook`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/auto-sync/url.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/auto-sync/url.ts tests/lib/auto-sync/url.test.ts
git commit -m "feat(auto-sync): webhook URL builder"
```

---

## Task 4: `lib/auto-sync/repo.ts` — config DB access

**Files:**
- Create: `lib/auto-sync/repo.ts`
- Test: `tests/lib/auto-sync/repo.test.ts`

`generateSecret` is pure and unit-tested here. The DB functions are integration-tested against a real Postgres, gated behind `RUN_DB_TESTS` (matching `tests/lib/billing/repo.test.ts`). They are also exercised indirectly by the route tests in Tasks 5–6, which mock this module.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auto-sync/repo.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, personaAutoSync } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  generateSecret,
  getAutoSyncConfig,
  enableAutoSync,
  disableAutoSync,
  regenerateSecret,
  touchLastDelivery,
} from "@/lib/auto-sync/repo";

describe("generateSecret", () => {
  it("returns a 64-char hex string", () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
  it("returns a different value each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("auto-sync/repo (integration)", () => {
  const db = getDb();
  const username = `test-autosync-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(personaAutoSync).where(eq(personaAutoSync.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("enable creates a row with a secret, disable keeps the secret", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    expect(await getAutoSyncConfig(accountId)).toBeNull();

    const enabled = await enableAutoSync(accountId);
    expect(enabled.enabled).toBe(true);
    expect(enabled.secret).toMatch(/^[0-9a-f]{64}$/);

    const disabled = await disableAutoSync(accountId);
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.secret).toBe(enabled.secret); // secret retained

    const reenabled = await enableAutoSync(accountId);
    expect(reenabled.enabled).toBe(true);
    expect(reenabled.secret).toBe(enabled.secret); // same secret, instant re-enable
  });

  it("regenerate replaces the secret", async () => {
    const before = await getAutoSyncConfig(accountId);
    const after = await regenerateSecret(accountId);
    expect(after.secret).not.toBe(before?.secret);
  });

  it("touchLastDelivery stamps last_delivery_at", async () => {
    await touchLastDelivery(accountId);
    const row = await getAutoSyncConfig(accountId);
    expect(row?.lastDeliveryAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/auto-sync/repo.test.ts`
Expected: FAIL — cannot find module `@/lib/auto-sync/repo` (the `generateSecret` describe fails to import; the integration describe is skipped without `RUN_DB_TESTS`).

- [ ] **Step 3: Write the implementation**

Create `lib/auto-sync/repo.ts`:

```ts
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { personaAutoSync, type PersonaAutoSync } from "@/lib/db/schema";

/** 32 random bytes as hex — the GitHub webhook HMAC signing secret. */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function getAutoSyncConfig(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .select()
    .from(personaAutoSync)
    .where(eq(personaAutoSync.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/**
 * Enable auto-sync. Creates the row with a fresh secret on first enable; on a
 * later enable it only flips the flag back on, keeping the existing secret so
 * an already-installed GitHub hook keeps verifying.
 */
export async function enableAutoSync(accountId: string): Promise<PersonaAutoSync> {
  const existing = await getAutoSyncConfig(accountId);
  if (existing) {
    const [row] = await getDb()
      .update(personaAutoSync)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(personaAutoSync.accountId, accountId))
      .returning();
    return row;
  }
  const [row] = await getDb()
    .insert(personaAutoSync)
    .values({ accountId, enabled: true, secret: generateSecret() })
    .returning();
  return row;
}

/** Pause auto-sync, keeping the secret. Returns null if no row exists. */
export async function disableAutoSync(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .update(personaAutoSync)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(personaAutoSync.accountId, accountId))
    .returning();
  return row ?? null;
}

/**
 * Rotate the secret. Creates a (disabled) row if none exists yet so regenerate
 * is callable before first enable. The old secret stops verifying immediately.
 */
export async function regenerateSecret(accountId: string): Promise<PersonaAutoSync> {
  const existing = await getAutoSyncConfig(accountId);
  if (!existing) {
    const [row] = await getDb()
      .insert(personaAutoSync)
      .values({ accountId, enabled: false, secret: generateSecret() })
      .returning();
    return row;
  }
  const [row] = await getDb()
    .update(personaAutoSync)
    .set({ secret: generateSecret(), updatedAt: new Date() })
    .where(eq(personaAutoSync.accountId, accountId))
    .returning();
  return row;
}

/** Record that a verified delivery was received (observability only). */
export async function touchLastDelivery(accountId: string): Promise<void> {
  await getDb()
    .update(personaAutoSync)
    .set({ lastDeliveryAt: new Date() })
    .where(eq(personaAutoSync.accountId, accountId));
}
```

- [ ] **Step 4: Run the test to verify the pure part passes**

Run: `pnpm vitest run tests/lib/auto-sync/repo.test.ts`
Expected: PASS — the `generateSecret` describe passes; the integration describe is skipped (no `RUN_DB_TESTS`).

- [ ] **Step 5: Commit**

```bash
git add lib/auto-sync/repo.ts tests/lib/auto-sync/repo.test.ts
git commit -m "feat(auto-sync): config repo (enable/disable/regenerate/touch)"
```

---

## Task 5: webhook route `POST /api/a/[username]/sync-webhook`

**Files:**
- Create: `app/api/a/[username]/sync-webhook/route.ts`
- Test: `tests/app/api/a/sync-webhook.test.ts`

The route is thin orchestration over the units above; the test mocks the data deps (`@/lib/accounts/load`, `@/lib/auto-sync/repo`, `@/lib/persona-source`) and uses the REAL `verify.ts`, asserting the security-critical paths.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/a/sync-webhook.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const ACCOUNT = { id: "acct-1", username: "alex", status: "active" };
const SECRET = "s".repeat(64);
const ACTIVE = { repoUrl: "https://github.com/alex/content", branch: "main", commitSha: "abc" };

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const syncSpy = vi.fn(async () => ({ kind: "ok", commitSha: "abc", syncedAt: new Date() }));
const afterCbs: Array<() => unknown> = [];

function mockDeps(opts: { account?: unknown; config?: unknown; active?: unknown } = {}) {
  vi.doMock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server");
    return { ...actual, after: (cb: () => unknown) => afterCbs.push(cb) };
  });
  vi.doMock("@/lib/accounts/load", () => ({
    loadAccountForSlug: async () => ("account" in opts ? opts.account : ACCOUNT),
  }));
  vi.doMock("@/lib/auto-sync/repo", () => ({
    getAutoSyncConfig: async () =>
      "config" in opts ? opts.config : { accountId: "acct-1", enabled: true, secret: SECRET },
    touchLastDelivery: vi.fn(async () => {}),
  }));
  vi.doMock("@/lib/persona-source", () => ({
    getActivePersonaSourceRowForAccount: async () => ("active" in opts ? opts.active : ACTIVE),
    syncFromGitHubForAccount: syncSpy,
  }));
}

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import("@/app/api/a/[username]/sync-webhook/route");
  const req = new Request("http://localhost/api/a/alex/sync-webhook", {
    method: "POST",
    headers,
    body,
  });
  return POST(req, { params: Promise.resolve({ username: "alex" }) });
}

describe("POST /api/a/[username]/sync-webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    syncSpy.mockClear();
    afterCbs.length = 0;
  });

  it("syncs the STORED source on a verified push to the stored branch", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main", repository: { full_name: "attacker/evil" } });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    // Stored repo+branch used, payload repo IGNORED.
    expect(syncSpy).toHaveBeenCalledWith("acct-1", ACTIVE.repoUrl, ACTIVE.branch);
  });

  it("rejects an invalid signature with 401 and never syncs", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body, "wrong-secret"),
    });
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, { "x-github-event": "push" });
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("pongs a verified ping without syncing", async () => {
    mockDeps();
    const body = JSON.stringify({ zen: "hi", hook_id: 1 });
    const res = await post(body, {
      "x-github-event": "ping",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pong: true });
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a verified push to a different branch", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/dev" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips when auto-sync is disabled", async () => {
    mockDeps({ config: { accountId: "acct-1", enabled: false, secret: SECRET } });
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("404s when the account is unknown", async () => {
    mockDeps({ account: null });
    const res = await post("{}", { "x-github-event": "push" });
    expect(res.status).toBe(404);
  });

  it("404s when no auto-sync config exists", async () => {
    mockDeps({ config: null });
    const res = await post("{}", { "x-github-event": "push" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/api/a/sync-webhook.test.ts`
Expected: FAIL — cannot find module `@/app/api/a/[username]/sync-webhook/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/a/[username]/sync-webhook/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { getAutoSyncConfig, touchLastDelivery } from "@/lib/auto-sync/repo";
import { verifySignature, decideAction } from "@/lib/auto-sync/verify";
import {
  getActivePersonaSourceRowForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

/**
 * Public GitHub `push` webhook. Authenticated ONLY by the per-account HMAC
 * secret — never a session. A verified, eligible push acks 200 immediately and
 * runs the sync in `after()` so a slow or failing sync never makes GitHub
 * retry; failures are recorded in persona_source history. The repo + branch are
 * always read from the account's STORED active source, never the payload.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  const config = await getAutoSyncConfig(account.id);
  if (!config) {
    return NextResponse.json({ error: "auto-sync not configured" }, { status: 404 });
  }

  // Read the RAW body for HMAC; verify BEFORE parsing or acting on anything.
  const rawBody = await req.text();
  if (!verifySignature(config.secret, rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { ref?: unknown } = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // A ping/push always has a JSON body; a non-JSON body simply yields no ref.
  }

  const active = await getActivePersonaSourceRowForAccount(account.id);
  const decision = decideAction({
    event: req.headers.get("x-github-event"),
    ref: typeof payload.ref === "string" ? payload.ref : null,
    enabled: config.enabled,
    branch: active?.branch ?? "",
  });

  if (decision === "pong") return NextResponse.json({ ok: true, pong: true });
  if (decision === "skip" || !active) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Eligible push: stamp the delivery, ack, sync the stored source in the
  // background. syncFromGitHubForAccount has its own in-flight dedupe.
  await touchLastDelivery(account.id);
  after(() => syncFromGitHubForAccount(account.id, active.repoUrl, active.branch));
  return NextResponse.json({ ok: true, syncing: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/api/a/sync-webhook.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/a/[username]/sync-webhook/route.ts" tests/app/api/a/sync-webhook.test.ts
git commit -m "feat(auto-sync): HMAC-gated push webhook route"
```

---

## Task 6: admin route `GET/POST /api/a/[username]/admin/auto-sync`

**Files:**
- Create: `app/api/a/[username]/admin/auto-sync/route.ts`
- Test: `tests/app/api/a/admin-auto-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/a/admin-auto-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const ACCOUNT = { id: "acct-1", username: "alex" };

function mockAuth(ok = true) {
  vi.doMock("@/app/[username]/admin/resolve", () => ({
    resolveAccountAdmin: async () =>
      ok ? { kind: "ok", account: ACCOUNT } : { kind: "not-found" },
  }));
}

const repo = {
  getAutoSyncConfig: vi.fn(),
  enableAutoSync: vi.fn(),
  disableAutoSync: vi.fn(),
  regenerateSecret: vi.fn(),
};

function mockRepo() {
  vi.doMock("@/lib/auto-sync/repo", () => repo);
  vi.doMock("@/lib/auto-sync/url", () => ({
    webhookUrlFor: (u: string) => `https://queritae.com/api/a/${u}/sync-webhook`,
  }));
}

async function callGet() {
  const { GET } = await import("@/app/api/a/[username]/admin/auto-sync/route");
  return GET(new Request("http://localhost"), { params: Promise.resolve({ username: "alex" }) });
}

async function callPost(action: unknown) {
  const { POST } = await import("@/app/api/a/[username]/admin/auto-sync/route");
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return POST(req, { params: Promise.resolve({ username: "alex" }) });
}

describe("/api/a/[username]/admin/auto-sync", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(repo).forEach((f) => f.mockReset());
  });

  it("GET 404s when not authorized", async () => {
    mockAuth(false);
    mockRepo();
    expect((await callGet()).status).toBe(404);
  });

  it("GET returns the view with revealed secret + webhook URL", async () => {
    mockAuth();
    mockRepo();
    repo.getAutoSyncConfig.mockResolvedValue({
      enabled: true,
      secret: "deadbeef",
      lastDeliveryAt: null,
    });
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeef",
      lastDeliveryAt: null,
    });
  });

  it("GET reports not-configured when no row exists", async () => {
    mockAuth();
    mockRepo();
    repo.getAutoSyncConfig.mockResolvedValue(null);
    const body = await (await callGet()).json();
    expect(body).toMatchObject({ enabled: false, configured: false, secret: null });
  });

  it("POST enable calls enableAutoSync and returns the view", async () => {
    mockAuth();
    mockRepo();
    repo.enableAutoSync.mockResolvedValue({ enabled: true, secret: "newsecret", lastDeliveryAt: null });
    const res = await callPost("enable");
    expect(res.status).toBe(200);
    expect(repo.enableAutoSync).toHaveBeenCalledWith("acct-1");
    expect(await res.json()).toMatchObject({ enabled: true, secret: "newsecret" });
  });

  it("POST disable calls disableAutoSync", async () => {
    mockAuth();
    mockRepo();
    repo.disableAutoSync.mockResolvedValue({ enabled: false, secret: "kept", lastDeliveryAt: null });
    const res = await callPost("disable");
    expect(repo.disableAutoSync).toHaveBeenCalledWith("acct-1");
    expect(await res.json()).toMatchObject({ enabled: false, secret: "kept" });
  });

  it("POST regenerate calls regenerateSecret", async () => {
    mockAuth();
    mockRepo();
    repo.regenerateSecret.mockResolvedValue({ enabled: true, secret: "rotated", lastDeliveryAt: null });
    const res = await callPost("regenerate");
    expect(repo.regenerateSecret).toHaveBeenCalledWith("acct-1");
    expect(await res.json()).toMatchObject({ secret: "rotated" });
  });

  it("POST 400s on an unknown action", async () => {
    mockAuth();
    mockRepo();
    expect((await callPost("frobnicate")).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/api/a/admin-auto-sync.test.ts`
Expected: FAIL — cannot find module `@/app/api/a/[username]/admin/auto-sync/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/a/[username]/admin/auto-sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import {
  getAutoSyncConfig,
  enableAutoSync,
  disableAutoSync,
  regenerateSecret,
} from "@/lib/auto-sync/repo";
import { webhookUrlFor } from "@/lib/auto-sync/url";
import type { PersonaAutoSync } from "@/lib/db/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

/** Owner-facing view: reveals the secret (needed to configure the hook). */
function view(username: string, config: PersonaAutoSync | null) {
  return {
    enabled: config?.enabled ?? false,
    configured: config !== null,
    webhookUrl: webhookUrlFor(username),
    secret: config?.secret ?? null,
    lastDeliveryAt: config?.lastDeliveryAt ?? null,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const config = await getAutoSyncConfig(res.account.id);
  return NextResponse.json(view(res.account.username, config));
}

export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let config: PersonaAutoSync | null;
  switch (body.action) {
    case "enable":
      config = await enableAutoSync(res.account.id);
      break;
    case "disable":
      config = await disableAutoSync(res.account.id);
      break;
    case "regenerate":
      config = await regenerateSecret(res.account.id);
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return NextResponse.json(view(res.account.username, config));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/api/a/admin-auto-sync.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/a/[username]/admin/auto-sync/route.ts" tests/app/api/a/admin-auto-sync.test.ts
git commit -m "feat(auto-sync): admin enable/disable/regenerate route"
```

---

## Task 7: `AutoSyncPanel` component + wire into the Content page

**Files:**
- Create: `components/admin/auto-sync-panel.tsx`
- Test: `tests/components/admin/auto-sync-panel.test.tsx`
- Modify: `app/[username]/admin/settings/content/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/auto-sync-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";

function stubFetch(view: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(view), { status: 200 })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AutoSyncPanel", () => {
  it("shows the webhook URL and secret when enabled", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByText(/sync-webhook/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/deadbeefsecret/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate secret/i })).toBeInTheDocument();
  });

  it("shows only an Enable button when disabled", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: null,
      lastDeliveryAt: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument(),
    );
    // Secret is not revealed while disabled.
    expect(screen.queryByText(/sync-webhook/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/components/admin/auto-sync-panel.test.tsx`
Expected: FAIL — cannot find module `@/components/admin/auto-sync-panel`.

- [ ] **Step 3: Write the component**

Create `components/admin/auto-sync-panel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type View = {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string;
  secret: string | null;
  lastDeliveryAt: string | null;
};

type Action = "enable" | "disable" | "regenerate";

export function AutoSyncPanel({ apiBasePath }: { apiBasePath: string }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`${apiBasePath}/auto-sync`);
    if (res.ok) setView(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (action: Action) => {
    setBusy(true);
    const res = await fetch(`${apiBasePath}/auto-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setView(await res.json());
    setBusy(false);
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — leave the value on screen to copy manually */
    }
  };

  if (!view) return null;

  const ghCommand = view.secret
    ? `gh api repos/:owner/:repo/hooks -f name=web -F active=true -f 'events[]=push' ` +
      `-f config[url]=${view.webhookUrl} -f config[content_type]=json -f config[secret]=${view.secret}`
    : "";

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Auto-sync on push
        </h2>
        <button
          type="button"
          onClick={() => act(view.enabled ? "disable" : "enable")}
          disabled={busy}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
        >
          {view.enabled ? "Disable" : "Enable"}
        </button>
      </div>

      {view.enabled && view.secret ? (
        <div className="space-y-3 text-sm">
          <p className="text-[var(--color-text-tertiary)]">
            Add a GitHub webhook to your content repo so each push auto-syncs your page.
          </p>

          <CopyRow
            label="Payload URL"
            value={view.webhookUrl}
            copied={copied}
            onCopy={() => copy("url", view.webhookUrl)}
          />
          <CopyRow
            label="Secret"
            value={view.secret}
            copied={copied}
            onCopy={() => copy("secret", view.secret!)}
          />

          <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--color-text-tertiary)]">
            <li>Repo → Settings → Webhooks → Add webhook</li>
            <li>
              Paste the Payload URL, set Content type to <code>application/json</code>
            </li>
            <li>Paste the Secret, choose “Just the push event”, save</li>
          </ol>

          <CopyRow
            label="Or run (gh CLI)"
            value={ghCommand}
            copied={copied}
            onCopy={() => copy("gh", ghCommand)}
          />

          <button
            type="button"
            onClick={() => act("regenerate")}
            disabled={busy}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            Regenerate secret
          </button>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">
            Regenerating invalidates the old secret — update the webhook in GitHub afterward.
          </p>

          {view.lastDeliveryAt && (
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              Last delivery: {new Date(view.lastDeliveryAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Off — the live page only updates on a manual Sync. Enable to auto-sync on every push.
        </p>
      )}
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded border border-[var(--color-border)] px-2 py-1 text-xs">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded border border-[var(--color-border)] px-2 py-1 text-[10px]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/components/admin/auto-sync-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the panel into the Content page**

Modify `app/[username]/admin/settings/content/page.tsx`. Add the import and render the panel below `ContentTab`. The full file becomes:

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ContentTab } from "@/components/admin/content-tab";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const apiBasePath = `/api/a/${account.username}/admin`;
  return (
    <>
      <ContentTab apiBasePath={apiBasePath} username={account.username} />
      <AutoSyncPanel apiBasePath={apiBasePath} />
    </>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/admin/auto-sync-panel.tsx tests/components/admin/auto-sync-panel.test.tsx "app/[username]/admin/settings/content/page.tsx"
git commit -m "feat(auto-sync): admin AutoSyncPanel + Content page wiring"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including the four new `auto-sync` test files. The `auto-sync/repo` integration describe is skipped (no `RUN_DB_TESTS`), which is expected.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (There is no `lint` script in this repo; `next build` runs ESLint if a full build check is wanted.)

- [ ] **Step 3: Confirm the migration is staged in history**

Run: `git log --oneline -8`
Expected: commits for tasks 1–7 present; the migration file from Task 1 is committed.

- [ ] **Step 4 (optional, requires a live test DB): run the integration tests**

Run: `RUN_DB_TESTS=1 pnpm vitest run tests/lib/auto-sync/repo.test.ts`
Expected: PASS — enable/disable/regenerate/touch round-trip against Postgres. Only run this if a disposable Postgres is configured via `POSTGRES_URL`.

---

## Self-review notes

- **Spec coverage:** `persona_auto_sync` table (Task 1) ✓; webhook route with full response table (Task 5) ✓; admin enable/disable/regenerate + GET view (Task 6) ✓; `AutoSyncPanel` on the Content page (Task 7) ✓; `verifySignature`/`decideAction`/`webhookUrlFor`/`generateSecret` helpers (Tasks 2–4) ✓. Security constraints — verify-or-401 (Task 5 test), stored-source-only with payload-repo-ignored (Task 5 test asserts `attacker/evil` is ignored), in-flight dedupe (reused primitive), fail-closed on disabled/no-config (Task 5 tests) — all covered.
- **Out of scope, intentionally absent:** no OAuth/token storage, no polling cron, no trailing-edge debounce, no onboarding auto-wiring — matching the spec's deferral list. The `webhook_id` column exists (Task 1) as the OAuth seam but is never written.
- **Type consistency:** `PersonaAutoSync` (Task 1) is the return type used by `repo.ts` (Task 4) and the admin route's `view()` (Task 6). The webhook `View`/admin `view()` shape (`enabled`, `configured`, `webhookUrl`, `secret`, `lastDeliveryAt`) matches the component's `View` type (Task 7) and the admin route test (Task 6). `decideAction`'s `DecideInput` (Task 2) matches the call site in Task 5. Repo function names (`enableAutoSync`/`disableAutoSync`/`regenerateSecret`/`getAutoSyncConfig`/`touchLastDelivery`/`generateSecret`) are identical across Tasks 4, 5, and 6.

# GitHub App Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Queritae GitHub App turns content-repo connection into a one-click install — installing the App identity-maps to the account, auto-configures the persona source, first-syncs, and delivers every future push automatically.

**Architecture:** One app-level webhook route `POST /api/github/app` HMAC-verifies deliveries against the app secret (reusing `verifySignature`) and routes `installation` / `installation_repositories` / `push` / `ping` events through a pure `parseDelivery`. Installs map by `sender.id → accounts.githubId` (reusing `getAccountByGithubId`); the install runs the first sync via `syncFromGitHubForAccount` (which records the `persona_source` row, so running the sync *is* configuring the source). A cosmetic callback redirects the user back to admin. The per-account webhook (2026-06-15) stays as the manual fallback.

**Tech Stack:** Next.js 15.5 (App Router, `runtime = "nodejs"`, `after` from `next/server`), Drizzle ORM 0.45 + drizzle-kit, Postgres, Vitest + React Testing Library, `node:crypto` HMAC (via the existing `verifySignature`).

**Spec:** [docs/superpowers/specs/2026-06-16-github-app-autosync-design.md](../specs/2026-06-16-github-app-autosync-design.md)

---

## File structure

New files:
- `lib/github-app/events.ts` — pure: `parseDelivery`, `pushMatchesSource`. No I/O.
- `lib/github-app/repo.ts` — DB: `findAccountIdByInstallation`, `connectInstallation`, `disconnectInstallation`.
- `lib/github-app/url.ts` — pure: `appInstallUrl()`.
- `app/api/github/app/route.ts` — the app webhook.
- `app/api/github/app/callback/route.ts` — cosmetic post-install redirect.
- `docs/github-app-setup.md` — ops note (env vars + registration steps).
- Tests mirroring each.

Modified files:
- `lib/db/schema.ts` — add `installationId` to `personaAutoSync` + unique index.
- `lib/db/migrations/` — generated migration (`pnpm db:generate`).
- `app/api/a/[username]/admin/auto-sync/route.ts` — `view()` adds `connectedViaApp` + `appInstallUrl`.
- `components/admin/auto-sync-panel.tsx` — App connect button + status.
- `docs/agent-setup-preamble.md` — step 6 (hand off via the App).

---

## Task 1: `installation_id` column on `persona_auto_sync`

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/00NN_*.sql` (generated)

Structural task; no unit test — the guard is the generated migration + `pnpm typecheck`.

- [ ] **Step 1: Add the column + unique index**

In `lib/db/schema.ts`, the `personaAutoSync` table currently is:

```ts
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
```

Add the `installationId` column after `webhookId`, and add a partial unique index in the callback. The new table definition is:

```ts
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
    // GitHub App installation id (stored as text; numeric but never used in
    // arithmetic). Set when the account connects via the GitHub App; null for
    // manual-webhook accounts. Unique-when-present.
    installationId: text("installation_id"),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("persona_auto_sync_account_unique").on(table.accountId),
    installationUnique: uniqueIndex("persona_auto_sync_installation_unique")
      .on(table.installationId)
      .where(sql`installation_id IS NOT NULL`),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `lib/db/migrations/00NN_*.sql` (next index after the latest) containing `ALTER TABLE "persona_auto_sync" ADD COLUMN "installation_id" text;` and `CREATE UNIQUE INDEX "persona_auto_sync_installation_unique" ... WHERE installation_id IS NOT NULL;`, plus updated `meta/`.

- [ ] **Step 3: Verify the SQL**

Run: `grep -l "installation_id" lib/db/migrations/*.sql && ls lib/db/migrations | tail -2`
Expected: the new `.sql` file matches and adds the column + partial unique index.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(github-app): add installation_id to persona_auto_sync"
```

---

## Task 2: `lib/github-app/events.ts` — pure delivery routing

**Files:**
- Create: `lib/github-app/events.ts`
- Test: `tests/lib/github-app/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/github-app/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDelivery, pushMatchesSource } from "@/lib/github-app/events";

describe("parseDelivery", () => {
  it("maps installation.created with one repo", () => {
    expect(
      parseDelivery("installation", {
        action: "created",
        installation: { id: 42 },
        sender: { id: 99 },
        repositories: [{ full_name: "alex/content" }],
      }),
    ).toEqual({ kind: "install", installationId: "42", githubUserId: "99", repos: ["alex/content"] });
  });

  it("maps installation.created with multiple repos", () => {
    const d = parseDelivery("installation", {
      action: "created",
      installation: { id: 1 },
      sender: { id: 2 },
      repositories: [{ full_name: "a/b" }, { full_name: "a/c" }],
    });
    expect(d).toMatchObject({ kind: "install", repos: ["a/b", "a/c"] });
  });

  it("maps installation.deleted to uninstall", () => {
    expect(parseDelivery("installation", { action: "deleted", installation: { id: 42 } })).toEqual({
      kind: "uninstall",
      installationId: "42",
    });
  });

  it("ignores other installation actions", () => {
    expect(parseDelivery("installation", { action: "suspend", installation: { id: 42 } })).toEqual({
      kind: "ignore",
    });
  });

  it("maps installation_repositories.added", () => {
    expect(
      parseDelivery("installation_repositories", {
        action: "added",
        installation: { id: 42 },
        repositories_added: [{ full_name: "alex/content" }],
      }),
    ).toEqual({ kind: "repos-added", installationId: "42", repos: ["alex/content"] });
  });

  it("maps push", () => {
    expect(
      parseDelivery("push", {
        ref: "refs/heads/main",
        installation: { id: 42 },
        repository: { full_name: "alex/content" },
      }),
    ).toEqual({ kind: "push", installationId: "42", repoFullName: "alex/content", ref: "refs/heads/main" });
  });

  it("maps ping to pong", () => {
    expect(parseDelivery("ping", { zen: "hi", installation: { id: 42 } })).toEqual({ kind: "pong" });
  });

  it("ignores unknown events and malformed payloads", () => {
    expect(parseDelivery("issues", {})).toEqual({ kind: "ignore" });
    expect(parseDelivery("installation", { action: "created", installation: {} })).toEqual({ kind: "ignore" });
    expect(parseDelivery("push", { ref: "refs/heads/main", installation: { id: 1 } })).toEqual({ kind: "ignore" });
  });
});

describe("pushMatchesSource", () => {
  const url = "https://github.com/alex/content";
  it("matches the stored repo + branch (case-insensitive repo)", () => {
    expect(pushMatchesSource("Alex/Content", "refs/heads/main", url, "main")).toBe(true);
  });
  it("rejects a different branch", () => {
    expect(pushMatchesSource("alex/content", "refs/heads/dev", url, "main")).toBe(false);
  });
  it("rejects a different repo", () => {
    expect(pushMatchesSource("alex/other", "refs/heads/main", url, "main")).toBe(false);
  });
  it("rejects when the stored URL is unparseable", () => {
    expect(pushMatchesSource("alex/content", "refs/heads/main", "not-a-url", "main")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/github-app/events.test.ts`
Expected: FAIL — cannot find module `@/lib/github-app/events`.

- [ ] **Step 3: Write the implementation**

Create `lib/github-app/events.ts`:

```ts
import { parseGitHubRepoUrl } from "@/lib/persona-source";

export type Delivery =
  | { kind: "install"; installationId: string; githubUserId: string; repos: string[] }
  | { kind: "uninstall"; installationId: string }
  | { kind: "repos-added"; installationId: string; repos: string[] }
  | { kind: "push"; installationId: string; repoFullName: string; ref: string }
  | { kind: "pong" }
  | { kind: "ignore" };

type AnyPayload = {
  action?: string;
  installation?: { id?: number | string };
  sender?: { id?: number | string };
  repositories?: Array<{ full_name?: string }>;
  repositories_added?: Array<{ full_name?: string }>;
  repository?: { full_name?: string };
  ref?: string;
};

const repoNames = (rs: Array<{ full_name?: string }> | undefined): string[] =>
  (rs ?? []).map((r) => r.full_name).filter((x): x is string => typeof x === "string" && x.length > 0);

/**
 * Normalizes a verified GitHub App delivery into the action the route takes.
 * Pure — no I/O. Anything unrecognized or missing required fields becomes
 * `ignore` (fail-closed): the route acks 200 and does nothing.
 */
export function parseDelivery(event: string | null, payload: unknown): Delivery {
  const p = (payload ?? {}) as AnyPayload;
  const installationId = p.installation?.id != null ? String(p.installation.id) : null;

  if (event === "ping") return { kind: "pong" };

  if (event === "installation") {
    if (!installationId) return { kind: "ignore" };
    if (p.action === "created") {
      const githubUserId = p.sender?.id != null ? String(p.sender.id) : null;
      if (!githubUserId) return { kind: "ignore" };
      return { kind: "install", installationId, githubUserId, repos: repoNames(p.repositories) };
    }
    if (p.action === "deleted") return { kind: "uninstall", installationId };
    return { kind: "ignore" };
  }

  if (event === "installation_repositories") {
    if (!installationId || p.action !== "added") return { kind: "ignore" };
    return { kind: "repos-added", installationId, repos: repoNames(p.repositories_added) };
  }

  if (event === "push") {
    const repoFullName = p.repository?.full_name;
    if (!installationId || !repoFullName || typeof p.ref !== "string") return { kind: "ignore" };
    return { kind: "push", installationId, repoFullName, ref: p.ref };
  }

  return { kind: "ignore" };
}

/**
 * True only when a push is for the account's STORED source repo and branch.
 * The security filter: the App may be installed on repos we don't sync, and a
 * push for any other repo/branch must be ignored. Repo comparison is
 * case-insensitive (GitHub treats owner/repo case-insensitively).
 */
export function pushMatchesSource(
  repoFullName: string,
  ref: string,
  sourceRepoUrl: string,
  sourceBranch: string,
): boolean {
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(sourceRepoUrl));
  } catch {
    return false;
  }
  return (
    repoFullName.toLowerCase() === `${owner}/${repo}`.toLowerCase() &&
    ref === `refs/heads/${sourceBranch}`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/github-app/events.test.ts`
Expected: PASS (12 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/github-app/events.ts tests/lib/github-app/events.test.ts
git commit -m "feat(github-app): pure delivery routing + push-source filter"
```

---

## Task 3: `lib/github-app/repo.ts` — installation DB access

**Files:**
- Create: `lib/github-app/repo.ts`
- Test: `tests/lib/github-app/repo.test.ts`

DB functions are integration-tested against a real Postgres, gated behind `RUN_DB_TESTS` (matching `tests/lib/auto-sync/repo.test.ts`). They are also exercised by the route tests in Task 4, which mock this module.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/github-app/repo.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, personaAutoSync } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  findAccountIdByInstallation,
  connectInstallation,
  disconnectInstallation,
} from "@/lib/github-app/repo";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("github-app/repo (integration)", () => {
  const db = getDb();
  const username = `test-ghapp-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(personaAutoSync).where(eq(personaAutoSync.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("connect creates a row with installation + secret, find resolves it, disconnect clears it", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    expect(await findAccountIdByInstallation("inst-1")).toBeNull();

    await connectInstallation(accountId, "inst-1");
    expect(await findAccountIdByInstallation("inst-1")).toBe(accountId);

    const [row] = await db
      .select()
      .from(personaAutoSync)
      .where(eq(personaAutoSync.accountId, accountId));
    expect(row.enabled).toBe(true);
    expect(row.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(row.installationId).toBe("inst-1");

    // Idempotent re-connect (e.g. existing manual-webhook row) keeps the secret.
    await connectInstallation(accountId, "inst-2");
    expect(await findAccountIdByInstallation("inst-2")).toBe(accountId);
    expect(await findAccountIdByInstallation("inst-1")).toBeNull();

    await disconnectInstallation("inst-2");
    expect(await findAccountIdByInstallation("inst-2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/github-app/repo.test.ts`
Expected: FAIL — cannot find module `@/lib/github-app/repo` (integration block skipped without `RUN_DB_TESTS`, but the import resolution fails the file).

- [ ] **Step 3: Write the implementation**

Create `lib/github-app/repo.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { personaAutoSync } from "@/lib/db/schema";
import { generateSecret, getAutoSyncConfig } from "@/lib/auto-sync/repo";

/** The account whose auto-sync row owns this GitHub App installation. */
export async function findAccountIdByInstallation(installationId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ accountId: personaAutoSync.accountId })
    .from(personaAutoSync)
    .where(eq(personaAutoSync.installationId, installationId))
    .limit(1);
  return row?.accountId ?? null;
}

/**
 * Bind an installation to an account, enabling auto-sync. Upserts the
 * `persona_auto_sync` row: on first connect it creates the row with a fresh
 * secret (so the not-null column is satisfied and the manual fallback stays
 * usable); on a later connect it sets the new installation id and re-enables,
 * keeping the existing secret. Idempotent.
 */
export async function connectInstallation(accountId: string, installationId: string): Promise<void> {
  const existing = await getAutoSyncConfig(accountId);
  if (existing) {
    await getDb()
      .update(personaAutoSync)
      .set({ installationId, enabled: true, updatedAt: sql`now()` })
      .where(eq(personaAutoSync.accountId, accountId));
    return;
  }
  await getDb()
    .insert(personaAutoSync)
    .values({ accountId, enabled: true, secret: generateSecret(), installationId });
}

/** Clear the installation binding (e.g. on uninstall). Keeps the row + secret. */
export async function disconnectInstallation(installationId: string): Promise<void> {
  await getDb()
    .update(personaAutoSync)
    .set({ installationId: null, updatedAt: sql`now()` })
    .where(eq(personaAutoSync.installationId, installationId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/github-app/repo.test.ts`
Expected: PASS — the integration describe is skipped without `RUN_DB_TESTS` (0 failures; file resolves and imports cleanly).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/github-app/repo.ts tests/lib/github-app/repo.test.ts
git commit -m "feat(github-app): installation repo (connect/find/disconnect)"
```

---

## Task 4: the app webhook route `POST /api/github/app`

**Files:**
- Create: `app/api/github/app/route.ts`
- Test: `tests/app/api/github/app-webhook.test.ts`

The route is thin orchestration over the units above; the test uses the REAL `verify.ts` + `events.ts` and mocks the data deps.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/github/app-webhook.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "s".repeat(64);
const ACCOUNT = { id: "acct-1", username: "alex", githubId: "99" };
const ACTIVE = { repoUrl: "https://github.com/alex/content", branch: "main", commitSha: "abc" };

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const syncSpy = vi.fn(async () => ({ kind: "ok", commitSha: "abc", syncedAt: new Date() }));
const connectSpy = vi.fn(async () => {});
const disconnectSpy = vi.fn(async () => {});
const touchSpy = vi.fn(async () => {});
const afterCbs: Array<() => unknown> = [];

function mockDeps(opts: {
  account?: unknown;
  installationAccountId?: string | null;
  config?: unknown;
  active?: unknown;
} = {}) {
  vi.doMock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server");
    return { ...actual, after: (cb: () => unknown) => afterCbs.push(cb) };
  });
  vi.doMock("@/lib/db/client", () => ({ getDb: () => ({}) }));
  vi.doMock("@/lib/accounts/repo", () => ({
    getAccountByGithubId: async () => ("account" in opts ? opts.account : ACCOUNT),
  }));
  vi.doMock("@/lib/github-app/repo", () => ({
    findAccountIdByInstallation: async () =>
      "installationAccountId" in opts ? opts.installationAccountId : ACCOUNT.id,
    connectInstallation: connectSpy,
    disconnectInstallation: disconnectSpy,
  }));
  vi.doMock("@/lib/auto-sync/repo", () => ({
    getAutoSyncConfig: async () => ("config" in opts ? opts.config : { enabled: true }),
    touchLastDelivery: touchSpy,
  }));
  vi.doMock("@/lib/persona-source", () => ({
    getActivePersonaSourceRowForAccount: async () => ("active" in opts ? opts.active : ACTIVE),
    syncFromGitHubForAccount: syncSpy,
    parseGitHubRepoUrl: (await vi.importActual<typeof import("@/lib/persona-source")>(
      "@/lib/persona-source",
    )).parseGitHubRepoUrl,
  }));
}

async function post(event: string, payload: object, opts?: { secret?: string; noSig?: boolean }) {
  const { POST } = await import("@/app/api/github/app/route");
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "x-github-event": event };
  if (!opts?.noSig) headers["x-hub-signature-256"] = sign(body, opts?.secret ?? SECRET);
  const req = new Request("http://localhost/api/github/app", { method: "POST", headers, body });
  return POST(req);
}

describe("POST /api/github/app", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
    [syncSpy, connectSpy, disconnectSpy, touchSpy].forEach((s) => s.mockClear());
    afterCbs.length = 0;
  });

  it("connects + first-syncs on installation.created with a single repo", async () => {
    mockDeps();
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 99 },
      repositories: [{ full_name: "alex/content" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).toHaveBeenCalledWith("acct-1", "42");
    for (const cb of afterCbs) await cb();
    expect(syncSpy).toHaveBeenCalledWith("acct-1", "https://github.com/alex/content", "main");
  });

  it("connects but does NOT sync on a multi-repo install", async () => {
    mockDeps();
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 99 },
      repositories: [{ full_name: "alex/a" }, { full_name: "alex/b" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).toHaveBeenCalled();
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("acks an unmatched install without connecting", async () => {
    mockDeps({ account: null });
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 12345 },
      repositories: [{ full_name: "x/y" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("disconnects on installation.deleted", async () => {
    mockDeps();
    const res = await post("installation", { action: "deleted", installation: { id: 42 } });
    expect(res.status).toBe(200);
    expect(disconnectSpy).toHaveBeenCalledWith("42");
  });

  it("syncs the stored source on a matching push", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    expect(touchSpy).toHaveBeenCalledWith("acct-1");
    for (const cb of afterCbs) await cb();
    expect(syncSpy).toHaveBeenCalledWith("acct-1", ACTIVE.repoUrl, ACTIVE.branch);
  });

  it("skips a push to a different branch", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/dev",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push for a repo that isn't the configured source", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/somethingelse" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push from an unknown installation", async () => {
    mockDeps({ installationAccountId: null });
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 999 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push when auto-sync is disabled", async () => {
    mockDeps({ config: { enabled: false } });
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("pongs a ping", async () => {
    mockDeps();
    const res = await post("ping", { zen: "hi", installation: { id: 42 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pong: true });
  });

  it("rejects an invalid signature with 401", async () => {
    mockDeps();
    const res = await post(
      "push",
      { ref: "refs/heads/main", installation: { id: 42 }, repository: { full_name: "alex/content" } },
      { secret: "wrong-secret" },
    );
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("500s when the app secret is unset", async () => {
    mockDeps();
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    const res = await post("ping", { installation: { id: 1 } }, { noSig: true });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/api/github/app-webhook.test.ts`
Expected: FAIL — cannot find module `@/app/api/github/app/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/github/app/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db/client";
import { getAccountByGithubId } from "@/lib/accounts/repo";
import { verifySignature } from "@/lib/auto-sync/verify";
import { parseDelivery, pushMatchesSource } from "@/lib/github-app/events";
import {
  findAccountIdByInstallation,
  connectInstallation,
  disconnectInstallation,
} from "@/lib/github-app/repo";
import { getAutoSyncConfig, touchLastDelivery } from "@/lib/auto-sync/repo";
import {
  getActivePersonaSourceRowForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";

export const runtime = "nodejs";

/**
 * The single GitHub App webhook. Authenticated ONLY by the app-level HMAC
 * secret. A verified delivery is routed by `parseDelivery`; installs map by
 * `sender.id → accounts.githubId`, and the install/first-sync + every push run
 * the reused `syncFromGitHubForAccount` against the account's STORED source in
 * `after()` so a slow/failed sync never makes GitHub retry.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("github app webhook: GITHUB_APP_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  if (!verifySignature(secret, rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Verified deliveries are JSON; a non-JSON body parses to {} → ignore.
  }

  const delivery = parseDelivery(req.headers.get("x-github-event"), payload);

  const syncInBackground = (accountId: string, repoUrl: string, branch: string) =>
    after(() =>
      syncFromGitHubForAccount(accountId, repoUrl, branch).catch((err) =>
        console.error(`github app: background sync failed for ${accountId}`, err),
      ),
    );

  switch (delivery.kind) {
    case "pong":
      return NextResponse.json({ ok: true, pong: true });

    case "install": {
      const account = await getAccountByGithubId(getDb(), delivery.githubUserId);
      if (!account) {
        console.error("github app: unmatched install for github user", delivery.githubUserId);
        return NextResponse.json({ ok: true, unmatched: true });
      }
      await connectInstallation(account.id, delivery.installationId);
      if (delivery.repos.length === 1) {
        syncInBackground(account.id, `https://github.com/${delivery.repos[0]}`, "main");
      }
      return NextResponse.json({ ok: true, connected: true });
    }

    case "uninstall":
      await disconnectInstallation(delivery.installationId);
      return NextResponse.json({ ok: true, disconnected: true });

    case "repos-added": {
      const accountId = await findAccountIdByInstallation(delivery.installationId);
      if (!accountId) return NextResponse.json({ ok: true, skipped: true });
      const active = await getActivePersonaSourceRowForAccount(accountId);
      if (!active && delivery.repos.length === 1) {
        syncInBackground(accountId, `https://github.com/${delivery.repos[0]}`, "main");
      }
      return NextResponse.json({ ok: true });
    }

    case "push": {
      const accountId = await findAccountIdByInstallation(delivery.installationId);
      if (!accountId) return NextResponse.json({ ok: true, skipped: true });
      const config = await getAutoSyncConfig(accountId);
      if (!config?.enabled) return NextResponse.json({ ok: true, skipped: true });
      const active = await getActivePersonaSourceRowForAccount(accountId);
      if (
        !active ||
        !pushMatchesSource(delivery.repoFullName, delivery.ref, active.repoUrl, active.branch)
      ) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      await touchLastDelivery(accountId);
      syncInBackground(accountId, active.repoUrl, active.branch);
      return NextResponse.json({ ok: true, syncing: true });
    }

    default:
      return NextResponse.json({ ok: true });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/api/github/app-webhook.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/github/app/route.ts" tests/app/api/github/app-webhook.test.ts
git commit -m "feat(github-app): app-level webhook (install/push/uninstall)"
```

---

## Task 5: install callback `GET /api/github/app/callback`

**Files:**
- Create: `app/api/github/app/callback/route.ts`
- Test: `tests/app/api/github/app-callback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/github/app-callback.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

function mockSession(account: unknown) {
  vi.doMock("@/lib/accounts/guard", () => ({ requireSessionAccount: async () => account }));
}

async function get() {
  const { GET } = await import("@/app/api/github/app/callback/route");
  return GET(new Request("http://localhost/api/github/app/callback?installation_id=42&setup_action=install"));
}

describe("GET /api/github/app/callback", () => {
  beforeEach(() => vi.resetModules());

  it("redirects a logged-in user to their admin content page", async () => {
    mockSession({ id: "a1", username: "alex" });
    const res = await get();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/alex/admin/settings/content?app=installed",
    );
  });

  it("redirects to login when there is no session", async () => {
    mockSession(null);
    const res = await get();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/api/auth/github/login");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/api/github/app-callback.test.ts`
Expected: FAIL — cannot find module `@/app/api/github/app/callback/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/github/app/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSessionAccount } from "@/lib/accounts/guard";

export const runtime = "nodejs";

/**
 * GitHub App "Setup URL" — hit after an install. The install→account mapping is
 * done authoritatively by the webhook (`installation.created`); this route is
 * purely UX: send the user back to their admin Content page (or to login if the
 * session has lapsed). It performs no privileged mutation.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const account = await requireSessionAccount();
  if (!account) {
    return NextResponse.redirect(new URL("/api/auth/github/login", origin));
  }
  return NextResponse.redirect(
    new URL(`/${account.username}/admin/settings/content?app=installed`, origin),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/api/github/app-callback.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/github/app/callback/route.ts" tests/app/api/github/app-callback.test.ts
git commit -m "feat(github-app): post-install callback redirect"
```

---

## Task 6: admin surfacing — `appInstallUrl` + `view()` + panel

**Files:**
- Create: `lib/github-app/url.ts`
- Test: `tests/lib/github-app/url.test.ts`
- Modify: `app/api/a/[username]/admin/auto-sync/route.ts`
- Modify: `components/admin/auto-sync-panel.tsx`
- Test: `tests/components/admin/auto-sync-panel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test for the URL helper**

Create `tests/lib/github-app/url.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { appInstallUrl } from "@/lib/github-app/url";

const original = process.env.GITHUB_APP_SLUG;
afterEach(() => {
  if (original === undefined) delete process.env.GITHUB_APP_SLUG;
  else process.env.GITHUB_APP_SLUG = original;
});

describe("appInstallUrl", () => {
  it("builds the install URL from the slug", () => {
    process.env.GITHUB_APP_SLUG = "queritae";
    expect(appInstallUrl()).toBe("https://github.com/apps/queritae/installations/new");
  });
  it("returns null when the slug is unset", () => {
    delete process.env.GITHUB_APP_SLUG;
    expect(appInstallUrl()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/lib/github-app/url.test.ts`
Expected: FAIL — cannot find module `@/lib/github-app/url`.

- [ ] **Step 3: Write the URL helper**

Create `lib/github-app/url.ts`:

```ts
/** The GitHub App install URL, or null when the app slug env is unset. */
export function appInstallUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run tests/lib/github-app/url.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Extend the admin `view()`**

In `app/api/a/[username]/admin/auto-sync/route.ts`, add the import and two view fields. Change the import block top to include:

```ts
import { appInstallUrl } from "@/lib/github-app/url";
```

Replace the `view()` function with:

```ts
/** Owner-facing view: reveals the secret (needed to configure the hook). */
function view(username: string, config: PersonaAutoSync | null) {
  return {
    enabled: config?.enabled ?? false,
    configured: config !== null,
    webhookUrl: webhookUrlFor(username),
    secret: config?.secret ?? null,
    lastDeliveryAt: config?.lastDeliveryAt ?? null,
    connectedViaApp: Boolean(config?.installationId),
    appInstallUrl: appInstallUrl(),
  };
}
```

- [ ] **Step 6: Update the admin route test for the new fields**

In `tests/app/api/a/admin-auto-sync.test.ts`, the GET-config test asserts the full view shape with `toEqual`. Find the test "GET returns the view with revealed secret + webhook URL" and update its expectation to include the two new fields. Its `getAutoSyncConfig.mockResolvedValue` returns `{ enabled: true, secret: "deadbeef", lastDeliveryAt: null }` — add `installationId: "inst-9"` to that mock and set `GITHUB_APP_SLUG` so the URL is present. Replace that test with:

```ts
  it("GET returns the view with revealed secret + webhook URL", async () => {
    process.env.GITHUB_APP_SLUG = "queritae";
    mockAuth();
    mockRepo();
    repo.getAutoSyncConfig.mockResolvedValue({
      enabled: true,
      secret: "deadbeef",
      lastDeliveryAt: null,
      installationId: "inst-9",
    });
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeef",
      lastDeliveryAt: null,
      connectedViaApp: true,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
  });
```

(The other admin-route tests use `toMatchObject`, so they keep passing without change.)

- [ ] **Step 7: Run the admin route test**

Run: `pnpm vitest run tests/app/api/a/admin-auto-sync.test.ts`
Expected: PASS (all tests, including the updated GET shape).

- [ ] **Step 8: Add the App UI to `AutoSyncPanel`**

In `components/admin/auto-sync-panel.tsx`, extend the `View` type and render the App section. Change the `View` type to add two fields:

```ts
type View = {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string;
  secret: string | null;
  lastDeliveryAt: string | null;
  connectedViaApp: boolean;
  appInstallUrl: string | null;
};
```

Then, immediately after the opening `<div className="space-y-4 border-t border-[var(--color-border)] p-4">` and before the existing header `<div className="flex items-center justify-between">`, insert the App block:

```tsx
      {view.appInstallUrl && (
        <div className="space-y-1">
          <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
            GitHub App
          </h2>
          {view.connectedViaApp ? (
            <p className="text-sm text-[var(--color-accent)]">Connected via GitHub App ✓</p>
          ) : (
            <>
              <a
                href={view.appInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                Connect with GitHub App (recommended)
              </a>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">
                One click installs auto-sync on your repo — no webhook setup below needed.
              </p>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 9: Add RTL tests for the App UI**

In `tests/components/admin/auto-sync-panel.test.tsx`, add two cases inside the `describe("AutoSyncPanel", ...)` block:

```tsx
  it("shows the Connect with GitHub App button when an install URL is present and not connected", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: null,
      lastDeliveryAt: null,
      connectedViaApp: false,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    const link = await screen.findByRole("link", { name: /connect with github app/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/queritae/installations/new");
  });

  it("shows connected status when connected via the App", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
      connectedViaApp: true,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByText(/connected via github app/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /connect with github app/i })).not.toBeInTheDocument();
  });
```

Note: the two EXISTING `AutoSyncPanel` tests pass a `view` object without the new fields. Add `connectedViaApp: false` and `appInstallUrl: null` to BOTH of those existing `stubFetch({...})` objects so they exercise the no-App path (the App block renders nothing when `appInstallUrl` is null).

- [ ] **Step 10: Run the component tests**

Run: `pnpm vitest run tests/components/admin/auto-sync-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 11: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add lib/github-app/url.ts tests/lib/github-app/url.test.ts "app/api/a/[username]/admin/auto-sync/route.ts" tests/app/api/a/admin-auto-sync.test.ts components/admin/auto-sync-panel.tsx tests/components/admin/auto-sync-panel.test.tsx
git commit -m "feat(github-app): admin Connect-with-GitHub-App button + status"
```

---

## Task 7: onboarding preamble + ops doc

**Files:**
- Modify: `docs/agent-setup-preamble.md`
- Create: `docs/github-app-setup.md`

No unit test (docs); verification is a grep + the existing setup-guide route test still passing.

- [ ] **Step 1: Update preamble step 6**

In `docs/agent-setup-preamble.md`, replace step 6 ("Hand off") — currently:

```
6. **Hand off.** Tell the user to paste the repo URL in their Queritae
   admin — **Settings → Content source**, then **Sync** (see "Connect it to
   Queritae" in the reference). If the sync reports an error, have the
   user paste it back to you; fix the file, push, and ask them to sync
   again.
```

with:

```
6. **Hand off.** Tell the user to open their Queritae admin —
   **Settings → Content** — and click **Connect with GitHub App**, then
   install it on the repo you just created. That single install is the whole
   connection step: their page goes live and auto-updates on every push. (If
   they'd rather connect manually, they can instead paste the repo URL under
   **Content source** and click **Sync**.) If a later sync reports an error,
   have the user paste it back to you; fix the file, push, and it re-syncs
   automatically.
```

- [ ] **Step 2: Create the ops doc**

Create `docs/github-app-setup.md`:

```markdown
# Queritae GitHub App — setup (ops)

The GitHub App makes content-repo connection a one-click install. Registering
it is a one-time operator task.

## Register the App (github.com → Settings → Developer settings → GitHub Apps → New)

- **Webhook URL:** `https://queritae.com/api/github/app`
- **Webhook secret:** generate a random secret; set it as `GITHUB_APP_WEBHOOK_SECRET`.
- **Setup URL:** `https://queritae.com/api/github/app/callback` (redirect on install).
- **Permissions:** Repository → **Contents: Read-only**, **Metadata: Read-only**.
- **Subscribe to events:** **Push**, **Installation**.
- A private key is generated by GitHub but is **not used in v1** (deliveries are
  signed with the webhook secret; content is fetched from the public tarball).

## Environment variables (local `.env.local` + Vercel)

- `GITHUB_APP_SLUG` — the app's URL slug (used to build the install link, e.g.
  `queritae` → `https://github.com/apps/queritae/installations/new`).
- `GITHUB_APP_WEBHOOK_SECRET` — the webhook signing secret.

## How it maps to accounts

On install, GitHub sends an `installation` event whose `sender.id` is the
installer's GitHub user id. That is matched to `accounts.github_id` (stored at
sign-in) to resolve the account. No token is stored. Public repos only in v1.
```

- [ ] **Step 3: Verify the served guide includes the new step**

The route `app/setup-guide.md/route.ts` concatenates the preamble + reference.
Run: `grep -c "Connect with GitHub App" docs/agent-setup-preamble.md`
Expected: `1` (the preamble now points at the App).

Run: `pnpm vitest run tests/ -t "setup-guide" 2>/dev/null || pnpm vitest run $(grep -rl "setup-guide" tests 2>/dev/null | tr '\n' ' ')`
Expected: any existing setup-guide route test still passes (the route just concatenates files). If no such test exists, this is a no-op.

- [ ] **Step 4: Commit**

```bash
git add docs/agent-setup-preamble.md docs/github-app-setup.md
git commit -m "docs(github-app): preamble hand-off via App + ops setup note"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including the new `github-app` test files. The `github-app/repo` integration describe is skipped (no `RUN_DB_TESTS`).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm commit history + migration**

Run: `git log --oneline main..HEAD && grep -l installation_id lib/db/migrations/*.sql`
Expected: commits for Tasks 1–7 present; the migration adds `installation_id`.

- [ ] **Step 4 (optional, needs a live test DB): run the repo integration tests**

Run: `RUN_DB_TESTS=1 pnpm vitest run tests/lib/github-app/repo.test.ts`
Expected: PASS — connect/find/disconnect round-trip against Postgres. Only run if a disposable Postgres is configured via `POSTGRES_URL`.

---

## Self-review notes

- **Spec coverage:** `installation_id` column (Task 1) ✓; pure `parseDelivery`/`pushMatchesSource` (Task 2) ✓; install→account repo (Task 3) ✓; app webhook handling install/uninstall/repos-added/push/ping with verify-or-401, identity-map, stored-source-only (Task 4) ✓; cosmetic callback (Task 5) ✓; admin `connectedViaApp` + `appInstallUrl` + panel button/status (Task 6) ✓; preamble step 6 + ops doc (Task 7) ✓. Security constraints — verify-before-act (Task 4 401 test), stored-source-only (push wrong-repo/branch tests + `pushMatchesSource`), identity-exact (unmatched-install test), ack-don't-retry (`after()` + `.catch`) — all covered. Reuses `verifySignature`, `syncFromGitHubForAccount`, `getAccountByGithubId`, `parseGitHubRepoUrl` unchanged.
- **Out of scope, intentionally absent:** no App private key / installation tokens (public-only), no org-identity resolution, no multi-repo picker, no replacement of the per-account webhook (kept as fallback).
- **Type consistency:** `Delivery` union (Task 2) is consumed by the route's `switch` (Task 4) with matching field names (`installationId`, `githubUserId`, `repos`, `repoFullName`, `ref`). `connectInstallation`/`disconnectInstallation`/`findAccountIdByInstallation` (Task 3) match their call sites and mocks (Task 4). `view()`'s new `connectedViaApp`/`appInstallUrl` (Task 6) match the component `View` type and the admin-route test. `appInstallUrl()` (Task 6) returns `string | null`, matching the component's `appInstallUrl: string | null`.

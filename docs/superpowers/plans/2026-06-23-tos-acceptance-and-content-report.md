# ToS Acceptance + Lean Content-Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-enforced Terms-acceptance gate at every authenticated boundary, the `/terms` + `/privacy` pages it points at, and a lean `mailto:` "Report this persona" action on persona pages.

**Architecture:** One nullable `accounts.tosAcceptedAt` column drives a pure `needsTosAcceptance` predicate enforced inside the existing admin gates (`requireAdminAccount`, `loadSuperConsole`) plus a fast-path in the OAuth callback. An unaccepted active account is redirected to `/auth/accept-tos`, whose form posts to an accept route that stamps the column and redirects back via an open-redirect-safe `returnTo`. The report path is a pure `buildReportMailto` helper whose output is threaded server→client into the existing About popover. No new persistence beyond the one column.

**Tech Stack:** Next.js App Router (server components + route handlers), Drizzle ORM (Postgres/Neon), drizzle-kit migrations, Vitest, React 19, Tailwind.

## Global Constraints

- New DB column: `tos_accepted_at timestamptz NULL`, no default. Timestamp-only — NO `tosVersion` (out of scope).
- Migrations are generated with `npm run db:generate` (drizzle-kit) and applied with `npm run db:migrate`. Next migration number is `0016`.
- The ToS check always targets the **session** account (the logged-in human), never an administered target account.
- `needsTosAcceptance(account)` ≙ `account.status === "active" && account.tosAcceptedAt == null`. Use `== null` (catches both `null` and `undefined`).
- `returnTo` is untrusted: only same-origin absolute paths are honored (starts with single `/`, not `//`, no scheme/backslash); otherwise fall back.
- Report email comes from `process.env.REPORT_EMAIL`, default `abuse@queritae.com`, read **server-side only**.
- All user-facing strings live in `lib/language.ts` with **both** `en` and `fr` values.
- Legal page copy is draft boilerplate and MUST render a visible banner: "Draft — review before relying on this. Not legal advice."
- Tests: Vitest, `@/` path alias, `vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }))` for route/gate tests. Run a single file with `npx vitest run <path>`.
- Commit after every task. Conventional-commit style; end the body with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

**New files**
- `lib/auth/return-to.ts` — `safeReturnTo` open-redirect guard (pure).
- `lib/report/mailto.ts` — `buildReportMailto` (pure).
- `app/api/auth/accept-tos/route.ts` — POST accept handler.
- `app/auth/accept-tos/page.tsx` — server interstitial.
- `components/accept-tos-form.tsx` — client form for the interstitial.
- `app/terms/page.tsx`, `app/privacy/page.tsx` — static legal pages.
- Tests: `tests/lib/auth/return-to.test.ts`, `tests/lib/report/mailto.test.ts`, `tests/app/api/auth/accept-tos.test.ts`, `tests/lib/accounts/tos-gate.test.ts`.

**Modified files**
- `lib/db/schema.ts` — add the column.
- `lib/accounts/repo.ts` — add `acceptTos`.
- `lib/accounts/guard.ts` — add `needsTosAcceptance`.
- `app/[username]/admin/resolve.ts` — add `needs-tos` resolution.
- `lib/admin/require-admin.ts` — redirect on `needs-tos`.
- `app/admin/load.ts` + `app/admin/page.tsx` — super-admin gate.
- `app/api/auth/github/callback/route.ts` — fast-path redirect.
- `lib/language.ts` — `about.report` string (en + fr).
- `components/about-popover.tsx` — report row + `reportHref` prop.
- `components/home-shell.tsx`, `components/home-page-client.tsx`, `app/[username]/page.tsx` — thread `reportHref`.
- Existing gate/callback tests — update mocks for the new column.

---

## Task 1: Add the `tosAcceptedAt` column

**Files:**
- Modify: `lib/db/schema.ts:30` (accounts table, after `createdAt`)
- Generate: `lib/db/migrations/0016_*.sql` (+ `lib/db/migrations/meta/*`)

**Interfaces:**
- Produces: `Account.tosAcceptedAt: Date | null` (via `$inferSelect`).

- [ ] **Step 1: Add the column to the schema**

In `lib/db/schema.ts`, inside the `accounts` `pgTable` columns object, add a line after `createdAt`:

```ts
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `lib/db/migrations/0016_*.sql` containing `ALTER TABLE "accounts" ADD COLUMN "tos_accepted_at" timestamp with time zone;` and an updated `meta/_journal.json`.

- [ ] **Step 3: Verify the SQL**

Run: `grep -r "tos_accepted_at" lib/db/migrations`
Expected: the new column appears in exactly one `0016_*.sql` ADD COLUMN statement.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the new optional field flows into `Account`).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): add accounts.tos_accepted_at column (migration 0016)"
```

> Note: `npm run db:migrate` against the real DB is an operator/deploy step, run outside this plan when deploying.

---

## Task 2: Pure helpers — `needsTosAcceptance` and `safeReturnTo`

**Files:**
- Modify: `lib/accounts/guard.ts`
- Create: `lib/auth/return-to.ts`
- Test: `tests/lib/accounts/tos-gate.test.ts`, `tests/lib/auth/return-to.test.ts`

**Interfaces:**
- Produces: `needsTosAcceptance(account: Account): boolean`
- Produces: `safeReturnTo(raw: string | null | undefined, fallback: string): string`

- [ ] **Step 1: Write the failing test for `needsTosAcceptance`**

Create `tests/lib/accounts/tos-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsTosAcceptance } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

function acct(over: Partial<Account>): Account {
  return {
    id: "a1",
    githubId: "1",
    username: "u",
    role: "user",
    status: "active",
    plan: "free",
    createdAt: new Date(),
    tosAcceptedAt: null,
    ...over,
  } as Account;
}

describe("needsTosAcceptance", () => {
  it("active + never accepted → true", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: null }))).toBe(true);
  });
  it("active + accepted → false", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: new Date() }))).toBe(false);
  });
  it("waitlisted → false regardless of acceptance", () => {
    expect(needsTosAcceptance(acct({ status: "waitlisted", tosAcceptedAt: null }))).toBe(false);
  });
  it("disabled → false regardless of acceptance", () => {
    expect(needsTosAcceptance(acct({ status: "disabled", tosAcceptedAt: null }))).toBe(false);
  });
  it("treats undefined acceptance as not accepted", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: undefined as unknown as null }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/accounts/tos-gate.test.ts`
Expected: FAIL — `needsTosAcceptance` is not exported.

- [ ] **Step 3: Implement `needsTosAcceptance`**

In `lib/accounts/guard.ts`, add at the end:

```ts
/**
 * True when this account holder must accept the Terms before using any
 * authenticated surface. Only gates *active* accounts — waitlisted/disabled
 * users never reach a gated surface, and gating them would trap them on the
 * interstitial. `== null` catches both a null column and an undefined field.
 */
export function needsTosAcceptance(account: Account): boolean {
  return account.status === "active" && account.tosAcceptedAt == null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/accounts/tos-gate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing test for `safeReturnTo`**

Create `tests/lib/auth/return-to.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

const FB = "/u/admin";

describe("safeReturnTo", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeReturnTo("/u/admin/settings", FB)).toBe("/u/admin/settings");
  });
  it("rejects protocol-relative URLs", () => {
    expect(safeReturnTo("//evil.com", FB)).toBe(FB);
  });
  it("rejects absolute URLs with a scheme", () => {
    expect(safeReturnTo("https://evil.com", FB)).toBe(FB);
    expect(safeReturnTo("javascript:alert(1)", FB)).toBe(FB);
  });
  it("rejects backslash tricks and non-slash starts", () => {
    expect(safeReturnTo("/\\evil.com", FB)).toBe(FB);
    expect(safeReturnTo("admin", FB)).toBe(FB);
  });
  it("falls back on null/empty", () => {
    expect(safeReturnTo(null, FB)).toBe(FB);
    expect(safeReturnTo("", FB)).toBe(FB);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/lib/auth/return-to.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `safeReturnTo`**

Create `lib/auth/return-to.ts`:

```ts
/**
 * Open-redirect guard for a `returnTo` query/form value. Only same-origin
 * absolute paths are honored: must start with a single "/", must not be
 * protocol-relative ("//"), must not contain a scheme or a backslash. Anything
 * else returns `fallback`.
 */
export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}
```

- [ ] **Step 8: Run both helper tests**

Run: `npx vitest run tests/lib/accounts/tos-gate.test.ts tests/lib/auth/return-to.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/accounts/guard.ts lib/auth/return-to.ts tests/lib/accounts/tos-gate.test.ts tests/lib/auth/return-to.test.ts
git commit -m "feat(auth): needsTosAcceptance predicate + safeReturnTo guard"
```

---

## Task 3: Accept route + `acceptTos` repo function

**Files:**
- Modify: `lib/accounts/repo.ts` (add `acceptTos`)
- Create: `app/api/auth/accept-tos/route.ts`
- Test: `tests/app/api/auth/accept-tos.test.ts`

**Interfaces:**
- Consumes: `safeReturnTo` (Task 2), `getSessionAccountId` (`@/lib/admin/auth`), `getDb` (`@/lib/db/client`).
- Produces: `acceptTos(db, accountId): Promise<Account>`; `POST /api/auth/accept-tos` (form-encoded `returnTo`), 303 redirect.

- [ ] **Step 1: Add `acceptTos` to the repo**

In `lib/accounts/repo.ts`, add after `setAccountStatus`:

```ts
/** Stamp the Terms acceptance time for an account. Idempotent (last write wins). */
export async function acceptTos(db: Db, accountId: string): Promise<Account> {
  const [row] = await db
    .update(accounts)
    .set({ tosAcceptedAt: new Date() })
    .where(eq(accounts.id, accountId))
    .returning();
  if (!row) throw new Error(`no account '${accountId}'`);
  return row;
}
```

- [ ] **Step 2: Write the failing route test**

Create `tests/app/api/auth/accept-tos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSessionAccountId = vi.fn();
const acceptTos = vi.fn();

vi.mock("@/lib/admin/auth", () => ({ getSessionAccountId }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ acceptTos }));

function postReq(form: Record<string, string>): NextRequest {
  const body = new URLSearchParams(form).toString();
  return new NextRequest("http://localhost/api/auth/accept-tos", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/accept-tos", () => {
  it("stamps acceptance and redirects to a safe returnTo", async () => {
    getSessionAccountId.mockResolvedValue("acct-1");
    acceptTos.mockResolvedValue({ id: "acct-1", username: "octocat" });
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "/octocat/admin" }));
    expect(acceptTos).toHaveBeenCalledWith({}, "acct-1");
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/octocat/admin");
  });

  it("ignores a hostile returnTo and falls back to the user's admin", async () => {
    getSessionAccountId.mockResolvedValue("acct-1");
    acceptTos.mockResolvedValue({ id: "acct-1", username: "octocat" });
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "https://evil.com" }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/octocat/admin");
  });

  it("redirects to login when there is no session", async () => {
    getSessionAccountId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "/x" }));
    expect(acceptTos).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/api/auth/github/login");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/app/api/auth/accept-tos.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 4: Implement the route**

Create `app/api/auth/accept-tos/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { acceptTos } from "@/lib/accounts/repo";
import { safeReturnTo } from "@/lib/auth/return-to";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const accountId = await getSessionAccountId();
  if (!accountId) {
    return NextResponse.redirect(new URL("/api/auth/github/login", origin), 303);
  }
  const account = await acceptTos(getDb(), accountId);
  const form = await req.formData();
  const returnTo = safeReturnTo(form.get("returnTo")?.toString(), `/${account.username}/admin`);
  return NextResponse.redirect(new URL(returnTo, origin), 303);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/app/api/auth/accept-tos.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/accounts/repo.ts app/api/auth/accept-tos/route.ts tests/app/api/auth/accept-tos.test.ts
git commit -m "feat(auth): accept-tos route + acceptTos repo write"
```

---

## Task 4: Enforce the gate (admin gates + callback fast-path)

**Files:**
- Modify: `app/[username]/admin/resolve.ts`, `lib/admin/require-admin.ts`
- Modify: `app/admin/load.ts`, `app/admin/page.tsx`
- Modify: `app/api/auth/github/callback/route.ts`
- Test: `tests/app/admin/resolve-account-admin.test.ts`
- Modify (fallout): `tests/app/api/auth/callback.test.ts`, `tests/app/admin-super.test.ts`, and any gate test mocking an active account

**Interfaces:**
- Consumes: `needsTosAcceptance` (Task 2).
- Produces: `AdminResolution` gains `{ kind: "needs-tos" }`; `loadSuperConsole` returns `{ kind: "forbidden" } | { kind: "needs-tos" } | { kind: "ok"; accounts: AccountSummary[] }`.

- [ ] **Step 1: Add the `needs-tos` branch to `resolveAccountAdmin`**

In `app/[username]/admin/resolve.ts`, update the type and logic:

```ts
import { loadAccountForSlug } from "@/lib/accounts/load";
import { requireSessionAccount, canAdminister, needsTosAcceptance } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

export type AdminResolution =
  | { kind: "not-found" }
  | { kind: "login" }
  | { kind: "needs-tos" }
  | { kind: "ok"; account: Account };

/** Shared gate for the per-account admin page + APIs. */
export async function resolveAccountAdmin(slug: string): Promise<AdminResolution> {
  const account = await loadAccountForSlug(slug);
  if (!account) return { kind: "not-found" };
  const session = await requireSessionAccount();
  if (!session) return { kind: "login" };
  if (needsTosAcceptance(session)) return { kind: "needs-tos" };
  if (!canAdminister(session, account)) return { kind: "not-found" };
  return { kind: "ok", account };
}
```

- [ ] **Step 2: Redirect on `needs-tos` in `requireAdminAccount`**

In `lib/admin/require-admin.ts`, add the branch (it already imports `redirect`):

```ts
export async function requireAdminAccount(username: string): Promise<Account> {
  const res = await resolveAdminCached(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");
  if (res.kind === "needs-tos") redirect(`/auth/accept-tos?returnTo=/${username}/admin`);
  return res.account;
}
```

- [ ] **Step 3: Gate the super-admin console**

In `app/admin/load.ts`:

```ts
import { getDb } from "@/lib/db/client";
import { requireSuperAdmin, needsTosAcceptance } from "@/lib/accounts/guard";
import { listAllAccounts, type AccountSummary } from "@/lib/accounts/repo";

export type SuperConsole =
  | { kind: "forbidden" }
  | { kind: "needs-tos" }
  | { kind: "ok"; accounts: AccountSummary[] };

export async function loadSuperConsole(): Promise<SuperConsole> {
  const su = await requireSuperAdmin();
  if (!su) return { kind: "forbidden" };
  if (needsTosAcceptance(su)) return { kind: "needs-tos" };
  return { kind: "ok", accounts: await listAllAccounts(getDb()) };
}
```

In `app/admin/page.tsx`, update the consumer:

```ts
import { redirect, notFound } from "next/navigation";
// ...
export default async function SuperAdminPage() {
  const result = await loadSuperConsole();
  if (result.kind === "forbidden") notFound();
  if (result.kind === "needs-tos") redirect("/auth/accept-tos?returnTo=/admin");
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 font-display text-xl text-[var(--color-text-primary)]">Accounts</h1>
      <AccountList accounts={result.accounts} />
    </main>
  );
}
```

- [ ] **Step 4: Add the callback fast-path**

In `app/api/auth/github/callback/route.ts`, replace the `dest` line (currently `:58`):

```ts
  // Active accounts that haven't accepted the Terms go to the interstitial
  // first; everyone else to admin (active+accepted) or the holding page.
  const dest =
    account.status === "active"
      ? account.tosAcceptedAt == null
        ? `/auth/accept-tos?returnTo=/${account.username}/admin`
        : `/${account.username}/admin`
      : "/waitlist";
```

- [ ] **Step 5: Update existing callback tests for the new column**

In `tests/app/api/auth/callback.test.ts`:
- In the first test ("provisions an account and sets the session cookie on success"), add `tosAcceptedAt: new Date()` to the `upsertAccountFromGitHub.mockResolvedValue({...})` so it still redirects to `/octocat/admin`.
- Add a new test directly after it:

```ts
  it("sends active accounts that haven't accepted the Terms to the interstitial", async () => {
    const state = createState(SECRET);
    exchangeCodeForToken.mockResolvedValue("tok");
    fetchGitHubUser.mockResolvedValue({ id: 99, login: "octocat" });
    upsertAccountFromGitHub.mockResolvedValue({ id: "acct-9", username: "octocat", status: "active", tosAcceptedAt: null });

    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackReq({ code: "c", state }, state));

    expect(res.headers.get("location")).toContain("/auth/accept-tos");
    expect(res.headers.get("location")).toContain("returnTo=/octocat/admin");
    expect(res.headers.get("set-cookie")).toContain("queritae_session=");
  });
```

- [ ] **Step 6: Lock the `resolveAccountAdmin` needs-tos branch**

Create `tests/app/admin/resolve-account-admin.test.ts` (mocks `requireSessionAccount` but keeps the real `needsTosAcceptance`/`canAdminister`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/accounts/guard")>()),
  requireSessionAccount,
}));

function acct(over: Record<string, unknown>) {
  return { id: "s1", username: "u", role: "user", status: "active", plan: "free", createdAt: new Date(), tosAcceptedAt: new Date(), ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveAccountAdmin ToS gate", () => {
  it("returns needs-tos for an active session that hasn't accepted", async () => {
    loadAccountForSlug.mockResolvedValue(acct({ id: "t1", username: "u" }));
    requireSessionAccount.mockResolvedValue(acct({ id: "t1", username: "u", tosAcceptedAt: null }));
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect((await resolveAccountAdmin("u")).kind).toBe("needs-tos");
  });

  it("returns ok once the session has accepted", async () => {
    loadAccountForSlug.mockResolvedValue(acct({ id: "t1", username: "u" }));
    requireSessionAccount.mockResolvedValue(acct({ id: "t1", username: "u", tosAcceptedAt: new Date() }));
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect((await resolveAccountAdmin("u")).kind).toBe("ok");
  });
});
```

Run: `npx vitest run tests/app/admin/resolve-account-admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the affected suites and fix fallout**

Run: `npx vitest run tests/app/api/auth/callback.test.ts tests/app/admin-super.test.ts`
Expected: PASS. `tests/app/admin-super.test.ts` asserts on `loadSuperConsole`'s shape — update its expectations to the new discriminated union (`result.kind === "ok"` / `result.accounts`), and add `tosAcceptedAt: new Date()` to any active-super-admin account mock so it isn't gated.

- [ ] **Step 8: Run the full suite and repair remaining mock fallout**

Run: `npx vitest run`
Expected: PASS. For every failure caused by an **active** account mock now routing to `needs-tos`/interstitial when the test expects access, add `tosAcceptedAt: new Date()` to that mock (the account has accepted). Do NOT weaken `needsTosAcceptance`. Then re-run until green.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add app/[username]/admin/resolve.ts lib/admin/require-admin.ts app/admin/load.ts app/admin/page.tsx app/api/auth/github/callback/route.ts tests
git commit -m "feat(auth): enforce ToS acceptance at admin gates + OAuth callback"
```

---

## Task 5: Interstitial page + client form

**Files:**
- Create: `app/auth/accept-tos/page.tsx`, `components/accept-tos-form.tsx`

**Interfaces:**
- Consumes: `requireSessionAccount`, `needsTosAcceptance` (guard); `safeReturnTo` (Task 2).

- [ ] **Step 1: Implement the client form**

Create `components/accept-tos-form.tsx`:

```tsx
"use client";

import { useState } from "react";

export function AcceptTosForm({ returnTo }: { returnTo: string }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <form method="POST" action="/api/auth/accept-tos" className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-control text-[var(--color-text-secondary)]">
        To continue, please review and accept our{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">Terms of Service</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">Privacy Policy</a>.
      </p>
      <label className="flex items-center gap-2 text-control text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I have read and agree to the Terms of Service and Privacy Policy.
      </label>
      <button
        type="submit"
        disabled={!agreed}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-control font-medium text-white disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implement the interstitial page**

Create `app/auth/accept-tos/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireSessionAccount, needsTosAcceptance } from "@/lib/accounts/guard";
import { safeReturnTo } from "@/lib/auth/return-to";
import { AcceptTosForm } from "@/components/accept-tos-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AcceptTosPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const account = await requireSessionAccount();
  if (!account) redirect("/api/auth/github/login");
  const fallback = `/${account.username}/admin`;
  const returnTo = safeReturnTo((await searchParams).returnTo, fallback);
  // Already accepted (or not an active account that needs to) → don't show the form.
  if (!needsTosAcceptance(account)) redirect(returnTo);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-xl text-[var(--color-text-primary)]">Before you continue</h1>
      <AcceptTosForm returnTo={returnTo} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/auth/accept-tos/page.tsx components/accept-tos-form.tsx
git commit -m "feat(auth): ToS acceptance interstitial page + form"
```

---

## Task 6: Legal pages (`/terms`, `/privacy`)

**Files:**
- Create: `app/terms/page.tsx`, `app/privacy/page.tsx`

- [ ] **Step 1: Implement `/terms`**

Create `app/terms/page.tsx`. Use the draft banner verbatim and reasonable SaaS boilerplate sections (Acceptance, The Service, Accounts, Acceptable use, Content ownership, Disclaimers, Liability, Changes, Contact). Skeleton:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — Queritae" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[var(--color-text-secondary)]">
      <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-2xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
        Draft — review before relying on this. Not legal advice.
      </div>
      <h1 className="mb-4 font-display text-2xl text-[var(--color-text-primary)]">Terms of Service</h1>
      <p className="mb-4">Last updated: 2026-06-23.</p>
      {/* Sections: Acceptance, The Service, Accounts & eligibility, Acceptable use,
          Content & ownership, Fees & billing, Disclaimers, Limitation of liability,
          Changes to these terms, Contact. Each an <h2> + <p>. */}
    </main>
  );
}
```

Fill each section with one or two plain-English paragraphs of standard SaaS terms (this is the deliverable copy, not a placeholder).

- [ ] **Step 2: Implement `/privacy`**

Create `app/privacy/page.tsx` mirroring the structure, with sections: What we collect (GitHub identity, usage/conversation data), How we use it, Third parties (GitHub, Stripe, Anthropic, Neon/Vercel hosting), Cookies/session, Data retention & deletion, Your rights (EU/GDPR), Contact. Same draft banner and `Metadata` title "Privacy Policy — Queritae".

- [ ] **Step 3: Verify they render and link correctly**

Run: `npm run typecheck`
Expected: no errors. (Optional: start the dev server and load `/terms` and `/privacy`.)

- [ ] **Step 4: Commit**

```bash
git add app/terms/page.tsx app/privacy/page.tsx
git commit -m "feat(legal): draft Terms of Service + Privacy Policy pages"
```

---

## Task 7: Report mailto helper

**Files:**
- Create: `lib/report/mailto.ts`
- Test: `tests/lib/report/mailto.test.ts`

**Interfaces:**
- Produces: `buildReportMailto(email: string, ctx: { slug: string; url: string }): string`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/report/mailto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReportMailto } from "@/lib/report/mailto";

describe("buildReportMailto", () => {
  it("builds a mailto with the email, an identifying subject, and a prefilled body", () => {
    const href = buildReportMailto("abuse@queritae.com", { slug: "octocat", url: "https://queritae.com/octocat" });
    expect(href.startsWith("mailto:abuse@queritae.com?")).toBe(true);
    const qs = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(qs.get("subject")).toContain("octocat");
    expect(qs.get("body")).toContain("https://queritae.com/octocat");
  });

  it("URL-encodes special characters", () => {
    const href = buildReportMailto("abuse@queritae.com", { slug: "a b", url: "https://x/y?z=1" });
    expect(href).not.toContain(" ");
    expect(href).toContain("https%3A%2F%2Fx%2Fy%3Fz%3D1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/report/mailto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `lib/report/mailto.ts`:

```ts
/**
 * Builds a `mailto:` href for the "Report this persona" action. Pure — the
 * caller resolves the abuse address (REPORT_EMAIL) and the persona's absolute
 * URL server-side. Subject/body are URL-encoded.
 */
export function buildReportMailto(email: string, ctx: { slug: string; url: string }): string {
  const subject = `Report: persona "${ctx.slug}" on Queritae`;
  const body = [
    `I'd like to report the persona at: ${ctx.url}`,
    "",
    "Reason (please describe):",
    "",
  ].join("\n");
  const qs = new URLSearchParams({ subject, body }).toString();
  return `mailto:${email}?${qs}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/report/mailto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/report/mailto.ts tests/lib/report/mailto.test.ts
git commit -m "feat(report): buildReportMailto helper"
```

---

## Task 8: Report row in the About popover + threading

**Files:**
- Modify: `lib/language.ts` (en `about` block ~`:89`, fr `about` block ~`:246`)
- Modify: `components/about-popover.tsx`
- Modify: `components/home-shell.tsx`, `components/home-page-client.tsx`, `app/[username]/page.tsx`

**Interfaces:**
- Consumes: `buildReportMailto` (Task 7), `resolveProfileUrl` (`@/lib/cv/profile-url`).
- Produces: `AboutPopoverProps.reportHref: string | null`, `AboutPopoverStrings.report: string`.

- [ ] **Step 1: Add the `report` string (both locales)**

In `lib/language.ts`, add `report` to the `about` object in **both** the `en` block (near `:89`) and the `fr` block (near `:246`):

```ts
      about: {
        buttonLabel: "About this project",
        title: "About this project",
        close: "Close",
        printableCv: "Printable CV",
        report: "Report this persona",
      },
```

For `fr`, use `report: "Signaler ce profil"` (keep the other `fr` `about` values unchanged).

- [ ] **Step 2: Add the report row to the popover**

In `components/about-popover.tsx`:
- Add `report: string;` to `AboutPopoverStrings`.
- Add `reportHref: string | null;` to `AboutPopoverProps` and destructure it.
- After the links `<div>` (the block ending at the `links.map` close, `:130`), render a divider + report link when `reportHref` is set:

```tsx
        {reportHref && (
          <div className="mt-1 border-t border-[var(--color-border)] pt-3">
            <a
              href={reportHref}
              className="inline-flex items-center gap-2 text-2xs uppercase tracking-wide text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            >
              {strings.report}
            </a>
          </div>
        )}
```

- [ ] **Step 3: Pass `report` + `reportHref` through `home-shell.tsx`**

In `components/home-shell.tsx`:
- Add `reportHref?: string | null` to the shell's props and destructure it (default `null`).
- In the `<AboutPopover ... strings={{ ... }}>` block (`:92`), add `report: t.about.report,` to the strings object, and add `reportHref={reportHref ?? null}` to the props.

- [ ] **Step 4: Thread `reportHref` through `home-page-client.tsx`**

In `components/home-page-client.tsx`, add `reportHref?: string | null` to its props, default `null`, and forward it to `<HomeShell reportHref={reportHref} ... />`.

- [ ] **Step 5: Build `reportHref` on the persona page**

In `app/[username]/page.tsx`, add the imports and compute the href before the return:

```ts
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { buildReportMailto } from "@/lib/report/mailto";
// ...
  const profileUrl = await resolveProfileUrl({ accountId: account.id, username: account.username });
  const reportEmail = process.env.REPORT_EMAIL ?? "abuse@queritae.com";
  const reportHref = buildReportMailto(reportEmail, { slug: account.username, url: profileUrl });
```

Then pass `reportHref={reportHref}` into `<HomePageClient ... />`.

- [ ] **Step 6: Typecheck + run the popover/report tests**

Run: `npm run typecheck && npx vitest run tests/lib/report/mailto.test.ts`
Expected: no type errors; mailto tests PASS. If a snapshot/component test for `about-popover` exists, update it for the new optional prop.

- [ ] **Step 7: Commit**

```bash
git add lib/language.ts components/about-popover.tsx components/home-shell.tsx components/home-page-client.tsx app/[username]/page.tsx
git commit -m "feat(report): 'Report this persona' mailto row in About popover"
```

---

## Task 9: Full verification + ROADMAP update

**Files:**
- Modify: `ROADMAP.md` (Phase 3)

- [ ] **Step 1: Full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors in the touched files.

- [ ] **Step 3: Update the ROADMAP**

In `ROADMAP.md` Phase 3, mark the two delivered items and note residue:

```markdown
- [x] **Terms acceptance** at first login (`tos_accepted_at` column + interstitial at `/auth/accept-tos`, enforced at the admin gates + OAuth callback). (2026-06-23)
- [~] **Account suspension** action — already functional via the `disabled` status; **content-report path shipped** as a lean `REPORT_EMAIL` mailto in the About popover (2026-06-23). Persisted report queue + "Disable→Suspend" relabel deferred.
```

Leave the **Impersonation guardrails** and **Ops checklist** items unchecked (later batches).

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): ToS acceptance + content-report shipped (Phase 3)"
```

---

## Notes for the deployer (not plan steps)
- Apply the migration in prod: `npm run db:migrate` (or the platform's migrate step).
- Set `REPORT_EMAIL` in Vercel env (or create/route the `abuse@queritae.com` alias).
- After deploy, every existing active account (including root/super-admin) sees the interstitial once on next authenticated access — expected.

# Agent Self-Onboarding via Scoped Setup Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user's coding agent register a freshly-built content repo with Queritae programmatically (using a short-lived scoped token embedded in the setup prompt), and retire the now-redundant per-account manual webhook so the GitHub App is the single push-sync mechanism.

**Architecture:** Phase 1 adds a scoped, HMAC-signed "setup token" (built like the existing session token but domain-separated and short-lived) that the admin UI mints on demand and bakes into the agent prompt. The `persona-source` connect/status endpoints accept that token as a `Bearer` credential in addition to the session cookie, so the agent can connect the repo and poll sync status without a browser. The one irreducible human step — installing the GitHub App for ongoing push-sync — stays. Phase 2 deletes the per-account manual webhook route, its `decideAction` router, the per-account `secret` machinery, and the `ManualWebhook` UI, after confirming no live accounts depend on it.

**Tech Stack:** Next.js App Router (route handlers, `runtime = "nodejs"`), TypeScript (strict), Drizzle ORM + Postgres, Vitest, Node `crypto` (HMAC).

## Global Constraints

- TypeScript strict mode; every API route exports `export const runtime = "nodejs";`.
- Tests run with `pnpm vitest run <path>`; full typecheck is `pnpm typecheck`. Tests live under `tests/` mirroring the source path.
- Setup tokens are HMAC-signed over a key **derived** from `SESSION_SECRET` (domain separation tag `"queritae-setup-token-v1"`), never the raw secret, so they can never collide with or be replayed as session tokens. TTL is exactly **60 minutes**.
- The content repo is always a **public** GitHub repo; sync fetches it unauthenticated. The setup token authorizes only persona-source connect/status for one account — never billing, account status, or ToS.
- UI: no icon libraries; use the existing design-token classes (`text-2xs`, `text-xs`, `border-[var(--color-border)]`, etc.) and match surrounding components.
- Product copy says "Queritae"; infra slugs (repo/dir/db) stay `queryme`. Do not rename infra.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Phase 1 — created:**
- `lib/admin/setup-token.ts` — pure mint/verify of the scoped setup token (crypto only, no I/O).
- `lib/admin/setup-token-guard.ts` — `resolveAccountAdminOrSetupToken(slug, req)`: session-first, Bearer-token fallback.
- `lib/admin/setup-prompt.ts` — pure `buildAgentPrompt(...)` string builder (testable without React/DOM).
- `app/api/a/[username]/admin/setup-token/route.ts` — session-authed mint endpoint.
- Tests: `tests/lib/admin/setup-token.test.ts`, `tests/lib/admin/setup-token-guard.test.ts`, `tests/lib/admin/setup-prompt.test.ts`, `tests/app/api/a/setup-token.test.ts`.

**Phase 1 — modified:**
- `app/api/a/[username]/admin/persona-source/route.ts` — accept the setup token via the new resolver.
- `components/admin/kb-setup-steps.tsx` — mint a token on copy, build the prompt via `buildAgentPrompt`.
- `docs/agent-setup-preamble.md` — agent registers the repo itself via the token; App install becomes the one user step.

**Phase 2 — deleted:**
- `app/api/a/[username]/sync-webhook/route.ts` (+ its test).
- `decideAction` from `lib/auto-sync/verify.ts` (keep `verifySignature` — the App webhook uses it).
- `lib/auto-sync/url.ts` (`webhookUrlFor`) and `generateSecret`/`regenerateSecret` from `lib/auto-sync/repo.ts`.
- `ManualWebhook` + `CopyRow` from `components/admin/auto-sync-panel.tsx`; `secret`/`webhookUrl`/`regenerate` from the auto-sync route `view()`.
- The `secret` column from `persona_auto_sync` (migration), once no code reads it.

---

# PHASE 1 — Agent self-registration via scoped setup token

### Task 1: Scoped setup-token primitive

**Files:**
- Create: `lib/admin/setup-token.ts`
- Test: `tests/lib/admin/setup-token.test.ts`

**Interfaces:**
- Consumes: nothing (Node `crypto` only).
- Produces:
  - `SETUP_TOKEN_TTL_MS: number` (3_600_000)
  - `createSetupToken(accountId: string, expiresAt: number, secret: string): string`
  - `verifySetupToken(token: string, now: number, secret: string): string | null` — returns accountId when valid + unexpired, else null.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin/setup-token.test.ts
import { describe, it, expect } from "vitest";
import {
  createSetupToken,
  verifySetupToken,
  SETUP_TOKEN_TTL_MS,
} from "@/lib/admin/setup-token";
import { createSessionToken } from "@/lib/admin/auth";

const SECRET = "test-secret";
const ACCT = "11111111-1111-1111-1111-111111111111";

describe("setup-token", () => {
  it("round-trips a valid token", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token, 1_000_000, SECRET)).toBe(ACCT);
  });

  it("rejects an expired token", () => {
    const exp = 1_000_000;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token, 1_000_001, SECRET)).toBeNull();
  });

  it("rejects a tampered signature and a wrong secret", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token + "x", 1_000_000, SECRET)).toBeNull();
    expect(verifySetupToken(token, 1_000_000, "other-secret")).toBeNull();
  });

  it("does NOT accept a session token (domain separation)", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const session = createSessionToken(ACCT, exp, SECRET);
    expect(verifySetupToken(session, 1_000_000, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/setup-token.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/setup-token`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/admin/setup-token.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Scoped, short-lived credential the admin UI bakes into the agent setup
 * prompt so a user's coding agent can register its freshly-built content repo
 * without a browser session. Format: `setup.${accountId}.${expiresAt}.${hmac}`.
 *
 * The HMAC is keyed by a value DERIVED from SESSION_SECRET (not the raw
 * secret), so a setup token can never be a valid session token or vice versa
 * even though both formats are dot-delimited — the signing keys differ.
 */
export const SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

const PREFIX = "setup";
const DOMAIN = "queritae-setup-token-v1";

function deriveKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(DOMAIN).digest();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mint a setup token for `accountId`, valid until `expiresAt` (epoch ms). */
export function createSetupToken(accountId: string, expiresAt: number, secret: string): string {
  const payload = `${PREFIX}.${accountId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify a setup token. Returns the accountId when the signature matches, the
 * prefix is correct, and the token is unexpired; otherwise null.
 */
export function verifySetupToken(token: string, now: number, secret: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const accountId = parts[1];
  const expiresAt = Number(parts[2]);
  if (!accountId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return accountId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/admin/setup-token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/setup-token.ts tests/lib/admin/setup-token.test.ts
git commit -m "feat(onboarding): scoped setup-token primitive"
```

---

### Task 2: Setup-token auth guard (session-first, Bearer fallback)

**Files:**
- Create: `lib/admin/setup-token-guard.ts`
- Test: `tests/lib/admin/setup-token-guard.test.ts`

**Interfaces:**
- Consumes: `resolveAccountAdmin(slug)` and `AdminResolution` from `@/app/[username]/admin/resolve`; `loadAccountForSlug` from `@/lib/accounts/load`; `verifySetupToken` from Task 1.
- Produces: `resolveAccountAdminViaSessionOrToken(slug: string, req: Request): Promise<AdminResolution>` — returns the existing `AdminResolution` union (`{kind:"ok",account}` | `"login"` | `"needs-tos"` | `"not-found"`). When there is no session, it accepts a `Authorization: Bearer <setup-token>` whose accountId equals the slug account's id.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin/setup-token-guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccountAdmin = vi.fn();
const loadAccountForSlug = vi.fn();

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));

import { resolveAccountAdminViaSessionOrToken } from "@/lib/admin/setup-token-guard";
import { createSetupToken } from "@/lib/admin/setup-token";

const ACCT = { id: "22222222-2222-2222-2222-222222222222", username: "ada" };

function reqWith(token?: string): Request {
  return new Request("https://x.test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("resolveAccountAdminViaSessionOrToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "s3cr3t";
  });

  it("returns the session resolution when a session is present", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith());
    expect(res).toEqual({ kind: "ok", account: ACCT });
    expect(loadAccountForSlug).not.toHaveBeenCalled();
  });

  it("accepts a valid setup token for the slug account when no session", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    loadAccountForSlug.mockResolvedValue(ACCT);
    const token = createSetupToken(ACCT.id, Date.now() + 60_000, "s3cr3t");
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith(token));
    expect(res).toEqual({ kind: "ok", account: ACCT });
  });

  it("rejects a token minted for a different account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    loadAccountForSlug.mockResolvedValue(ACCT);
    const token = createSetupToken("99999999-9999-9999-9999-999999999999", Date.now() + 60_000, "s3cr3t");
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith(token));
    expect(res).toEqual({ kind: "login" });
  });

  it("falls back to the session resolution when there is no bearer token", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith());
    expect(res).toEqual({ kind: "login" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/setup-token-guard.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/setup-token-guard`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/admin/setup-token-guard.ts
import { resolveAccountAdmin, type AdminResolution } from "@/app/[username]/admin/resolve";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { verifySetupToken } from "@/lib/admin/setup-token";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Like `resolveAccountAdmin`, but when there is no browser session it also
 * accepts a scoped setup token (Authorization: Bearer ...) whose accountId
 * matches the slug account. Used by the persona-source endpoints so a user's
 * coding agent can connect the repo headlessly during onboarding. Any other
 * resolution (not-found / needs-tos / ok) is returned unchanged.
 */
export async function resolveAccountAdminViaSessionOrToken(
  slug: string,
  req: Request,
): Promise<AdminResolution> {
  const session = await resolveAccountAdmin(slug);
  if (session.kind !== "login") return session;

  const token = bearer(req);
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return session;

  const accountId = verifySetupToken(token, Date.now(), secret);
  if (!accountId) return session;

  const account = await loadAccountForSlug(slug);
  if (!account || account.id !== accountId) return session;
  return { kind: "ok", account };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/admin/setup-token-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/setup-token-guard.ts tests/lib/admin/setup-token-guard.test.ts
git commit -m "feat(onboarding): setup-token auth guard"
```

---

### Task 3: Accept the setup token on the persona-source route

**Files:**
- Modify: `app/api/a/[username]/admin/persona-source/route.ts`
- Test: `tests/app/api/a/persona-source.test.ts` (existing — add a token case)

**Interfaces:**
- Consumes: `resolveAccountAdminViaSessionOrToken` (Task 2).
- Produces: no new exports; `GET`/`POST` now authorize via session **or** setup token.

- [ ] **Step 1: Write the failing test**

Append to `tests/app/api/a/persona-source.test.ts` (mock whatever the existing suite mocks; mirror its setup). The key new assertion: a request with a valid `Bearer` setup token and no session reaches `personaSourceSync`.

```ts
// add inside tests/app/api/a/persona-source.test.ts
import { createSetupToken } from "@/lib/admin/setup-token";

it("POST authorizes via a setup-token bearer when there is no session", async () => {
  // The existing suite mocks resolveAccountAdmin to return {kind:"login"}
  // for the no-session case and personaSourceSync for the work. Reuse those.
  process.env.SESSION_SECRET = "s3cr3t";
  // accountId/username must match the mocked loadAccountForSlug in this suite:
  const token = createSetupToken(MOCK_ACCOUNT.id, Date.now() + 60_000, "s3cr3t");
  const req = new Request("https://x.test/api/a/ada/admin/persona-source", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ repoUrl: "https://github.com/ada/cv" }),
  });
  const res = await POST(req, { params: Promise.resolve({ username: "ada" }) });
  expect(res.status).toBe(200);
  expect(personaSourceSyncMock).toHaveBeenCalledWith(MOCK_ACCOUNT.id, "https://github.com/ada/cv", undefined);
});
```

> If the existing suite does not already expose `MOCK_ACCOUNT`, `personaSourceSyncMock`, and a `loadAccountForSlug` mock, add them following the suite's existing mock style. The route now calls `loadAccountForSlug` indirectly through the guard, so the guard's deps (`@/app/[username]/admin/resolve`, `@/lib/accounts/load`) must be mocked here too.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/api/a/persona-source.test.ts`
Expected: FAIL — current route uses `resolveAccountAdmin` (session only) and returns 404 for the no-session token request.

- [ ] **Step 3: Apply the route change**

Replace the two `resolveAccountAdmin(username)` calls. The route currently reads:

```ts
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";
// ...
export async function GET(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  // ...
}
export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  // ...
}
```

Change to:

```ts
import { resolveAccountAdminViaSessionOrToken } from "@/lib/admin/setup-token-guard";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";
// ...
export async function GET(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdminViaSessionOrToken(username, req);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await personaSourceStatus(res.account.id));
}
export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdminViaSessionOrToken(username, req);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ...unchanged body parsing + personaSourceSync(res.account.id, ...)...
}
```

(The `GET` handler's first param changes from `_req` to `req` so the guard can read the header.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/app/api/a/persona-source.test.ts`
Expected: PASS (existing cases + the new token case).

- [ ] **Step 5: Commit**

```bash
git add app/api/a/[username]/admin/persona-source/route.ts tests/app/api/a/persona-source.test.ts
git commit -m "feat(onboarding): persona-source accepts scoped setup token"
```

---

### Task 4: Setup-token mint endpoint

**Files:**
- Create: `app/api/a/[username]/admin/setup-token/route.ts`
- Test: `tests/app/api/a/setup-token.test.ts`

**Interfaces:**
- Consumes: `resolveAccountAdmin` (session-only — minting requires a real logged-in owner), `createSetupToken` + `SETUP_TOKEN_TTL_MS` (Task 1), `checkRateLimit` + `getKv`.
- Produces: `POST` → `{ token: string, expiresAt: number }` (200) for the session owner; 404 otherwise; 429 when rate-limited.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/a/setup-token.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccountAdmin = vi.fn();
const checkRateLimit = vi.fn();
vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/kv/client", () => ({ getKv: () => ({}) }));
vi.mock("@/lib/kv/rate-limit", () => ({ checkRateLimit }));

import { POST } from "@/app/api/a/[username]/admin/setup-token/route";
import { verifySetupToken } from "@/lib/admin/setup-token";

const ACCT = { id: "33333333-3333-3333-3333-333333333333", username: "ada" };
const ctx = { params: Promise.resolve({ username: "ada" }) };
const post = () => POST(new Request("https://x.test", { method: "POST" }), ctx);

describe("POST setup-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "s3cr3t";
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("mints a verifiable token for the session owner", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(verifySetupToken(body.token, Date.now(), "s3cr3t")).toBe(ACCT.id);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("404s without a session", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    expect((await post()).status).toBe(404);
  });

  it("429s when rate-limited", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    checkRateLimit.mockResolvedValue({ allowed: false });
    expect((await post()).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/api/a/setup-token.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/a/[username]/admin/setup-token/route.ts
import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { createSetupToken, SETUP_TOKEN_TTL_MS } from "@/lib/admin/setup-token";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

// Mints a short-lived scoped token the owner pastes into their coding agent's
// setup prompt. Session-authed only — a token can never mint another token.
export async function POST(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Sessions not configured" }, { status: 500 });

  const limited = await checkRateLimit(getKv(), {
    key: `setup-token:${res.account.id}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const expiresAt = Date.now() + SETUP_TOKEN_TTL_MS;
  return NextResponse.json({ token: createSetupToken(res.account.id, expiresAt, secret), expiresAt });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/app/api/a/setup-token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/a/[username]/admin/setup-token/route.ts tests/app/api/a/setup-token.test.ts
git commit -m "feat(onboarding): setup-token mint endpoint"
```

---

### Task 5: Token-bearing agent prompt (pure builder + UI wiring)

**Files:**
- Create: `lib/admin/setup-prompt.ts`
- Test: `tests/lib/admin/setup-prompt.test.ts`
- Modify: `components/admin/kb-setup-steps.tsx`
- Test: `tests/components/admin/kb-setup-steps.test.tsx` (existing — update prompt assertion)

**Interfaces:**
- Consumes: nothing.
- Produces: `buildAgentPrompt(args: { origin: string; username: string; token: string; appInstallUrl: string | null }): string`. The prompt instructs the agent to (a) fetch `${origin}/setup-guide.md`, (b) build + push a public repo, (c) register it with a `curl` to `${origin}/api/a/${username}/admin/persona-source` carrying `Authorization: Bearer ${token}`, (d) tell the user to install the GitHub App (when `appInstallUrl` is set) for ongoing auto-sync.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin/setup-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "@/lib/admin/setup-prompt";

describe("buildAgentPrompt", () => {
  const base = {
    origin: "https://queritae.com",
    username: "ada",
    token: "setup.abc.123.sig",
    appInstallUrl: "https://github.com/apps/queritae/installations/new",
  };

  it("includes the guide URL, the register endpoint, and the bearer token", () => {
    const p = buildAgentPrompt(base);
    expect(p).toContain("https://queritae.com/setup-guide.md");
    expect(p).toContain("https://queritae.com/api/a/ada/admin/persona-source");
    expect(p).toContain("Authorization: Bearer setup.abc.123.sig");
    expect(p).toContain("expires"); // expiry warning present
  });

  it("points the user at the App install when available", () => {
    expect(buildAgentPrompt(base)).toContain(base.appInstallUrl);
  });

  it("omits the App line when no install URL", () => {
    const p = buildAgentPrompt({ ...base, appInstallUrl: null });
    expect(p).not.toContain("installations/new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/setup-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

```ts
// lib/admin/setup-prompt.ts

/**
 * The prompt a user pastes into their coding agent. It carries a short-lived
 * scoped token so the agent can register the repo itself; the only remaining
 * human step is the one-time GitHub App install for ongoing push-sync.
 */
export function buildAgentPrompt(args: {
  origin: string;
  username: string;
  token: string;
  appInstallUrl: string | null;
}): string {
  const { origin, username, token, appInstallUrl } = args;
  const registerUrl = `${origin}/api/a/${username}/admin/persona-source`;
  const lines = [
    `I'm setting up my Queritae knowledge base — a queryable CV that will live at ${origin}/${username}.`,
    "",
    `1. Fetch ${origin}/setup-guide.md and follow it exactly. Ask me for my source material (CV, LinkedIn export, portfolio links) and interview me briefly to fill gaps and capture stories.`,
    `2. When everything passes the guide's self-checks, create a PUBLIC GitHub repo and push.`,
    `3. Register the repo with Queritae (this credential expires in 60 minutes — if it lapses, ask me for a fresh prompt):`,
    "",
    `   curl -X POST ${registerUrl} \\`,
    `     -H "Authorization: Bearer ${token}" \\`,
    `     -H "Content-Type: application/json" \\`,
    `     -d '{"repoUrl":"https://github.com/<owner>/<repo>"}'`,
    "",
    `   A 200 with a commitSha means my page is live. If it returns an error, fix the reported file, push, and retry the same curl.`,
  ];
  if (appInstallUrl) {
    lines.push(
      "",
      `4. Finally, tell me to install the GitHub App at ${appInstallUrl} — one click turns on auto-sync so every future push updates my page.`,
    );
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/admin/setup-prompt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the builder into the component**

In `components/admin/kb-setup-steps.tsx`: remove the local `buildPrompt`; mint a token on copy, then build + copy. Replace the top of the component:

```tsx
"use client";

import { useRef, useState } from "react";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";
import { buildAgentPrompt } from "@/lib/admin/setup-prompt";

export function KbSetupSteps({
  username,
  apiBasePath,
  appInstallUrl,
  onSynced,
}: {
  username: string;
  apiBasePath: string;
  appInstallUrl?: string | null;
  onSynced: () => void | Promise<void>;
}) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      const res = await fetch(`${apiBasePath}/setup-token`, { method: "POST" });
      if (!res.ok) throw new Error("mint failed");
      const { token } = (await res.json()) as { token: string };
      const prompt = buildAgentPrompt({
        origin: window.location.origin,
        username,
        token,
        appInstallUrl: appInstallUrl ?? null,
      });
      await navigator.clipboard.writeText(prompt);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setFeedback("idle"), 2000);
  };
  // ...render unchanged EXCEPT: the <pre data-testid="setup-prompt"> static
  // preview is removed (the prompt now contains a live token and is only
  // assembled at copy time). Replace the preview block with short helper text:
  //   "Copy a ready-to-paste prompt — it includes a one-time credential so your
  //    agent can register the repo for you."
}
```

Update the step-1 markup to drop the `<pre>` preview and keep the Copy button + helper text.

- [ ] **Step 6: Update the component test**

In `tests/components/admin/kb-setup-steps.test.tsx`: the old test asserted the static `data-testid="setup-prompt"` text. Replace that assertion with: mock `fetch` to return `{ token: "setup.x.y.z" }`, click Copy, assert `navigator.clipboard.writeText` was called with a string containing `Authorization: Bearer setup.x.y.z`. Mock `navigator.clipboard.writeText` and `fetch` in the test setup.

- [ ] **Step 7: Run the component + builder tests**

Run: `pnpm vitest run tests/lib/admin/setup-prompt.test.ts tests/components/admin/kb-setup-steps.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/setup-prompt.ts tests/lib/admin/setup-prompt.test.ts components/admin/kb-setup-steps.tsx tests/components/admin/kb-setup-steps.test.tsx
git commit -m "feat(onboarding): agent prompt carries a scoped setup token"
```

---

### Task 6: Update the agent setup preamble doc

**Files:**
- Modify: `docs/agent-setup-preamble.md`
- Test: `tests/app/setup-guide.test.ts` (existing — keep green; adjust only if it asserts removed phrasing)

**Interfaces:** none (documentation).

- [ ] **Step 1: Rewrite the "Publish" + "Hand off" steps**

Replace workflow steps 5–6 so the agent registers the repo itself and the App install is the single user step. New text for those steps:

```markdown
5. **Publish.** Create a **public** GitHub repo (private repos cannot be
   synced — the fetch is unauthenticated) and push.
6. **Register it.** Your setup prompt includes a one-time `curl` with a scoped
   token — run it to register the repo with Queritae and trigger the first
   sync. A 200 with a `commitSha` means the page is live. If it returns a
   schema error, fix the named file, push, and re-run the same `curl`. The
   token expires in 60 minutes; if it lapses, ask the user for a fresh prompt.
7. **Hand off.** Tell the user their page is live, and that one optional step
   turns on auto-update: install the **GitHub App** (the prompt has the link),
   which syncs every future push automatically.
```

- [ ] **Step 2: Verify the setup-guide route test still passes**

Run: `pnpm vitest run tests/app/setup-guide.test.ts`
Expected: PASS (it asserts the preamble header + schema markers, which are unchanged). If it asserts removed phrasing, update that assertion to the new text.

- [ ] **Step 3: Commit**

```bash
git add docs/agent-setup-preamble.md tests/app/setup-guide.test.ts
git commit -m "docs(onboarding): agent registers repo via setup token"
```

---

### Phase 1 gate

- [ ] Run `pnpm typecheck` → clean.
- [ ] Run `pnpm vitest run tests/lib/admin tests/app/api/a tests/components/admin tests/app/setup-guide.test.ts` → all green.
- [ ] Manual smoke (local, optional): mint a token via the endpoint, `curl` persona-source with it, confirm a public repo connects with no session cookie.

---

# PHASE 2 — Retire the per-account manual webhook

> Phase 2 is pure simplification and is independent of Phase 1. Do not start it until Task 7 confirms it is safe.

### Task 7: PRECONDITION — confirm no live manual-webhook accounts

**Files:** none (operational check).

A "manual-webhook account" is a `persona_auto_sync` row with a `secret`, **no** `installationId`, and a recent `lastDeliveryAt` (its sync is driven by the per-account webhook, not the App).

- [ ] **Step 1: Query production**

```sql
SELECT count(*) AS manual_webhook_users
FROM persona_auto_sync
WHERE installation_id IS NULL
  AND last_delivery_at IS NOT NULL
  AND last_delivery_at > now() - interval '60 days';
```

- [ ] **Step 2: Decide**

- If `0`: proceed to Task 8.
- If `> 0`: STOP. These accounts lose auto-sync on deletion. Either migrate them (notify → install the App) or keep the webhook route alive behind a deprecation notice until they migrate. Record the count in the commit message for Task 11.

---

### Task 8: Delete the per-account webhook route + `decideAction`

**Files:**
- Delete: `app/api/a/[username]/sync-webhook/route.ts`
- Delete: its test (e.g. `tests/app/api/a/sync-webhook.test.ts` if present)
- Modify: `lib/auto-sync/verify.ts` (remove `decideAction`, `DecideInput`, `Decision`; **keep** `verifySignature` — the GitHub App webhook imports it)
- Modify: `tests/lib/auto-sync/verify.test.ts` (drop `decideAction` cases; keep `verifySignature` cases)

- [ ] **Step 1: Confirm `verifySignature` has another consumer**

Run: `grep -rn "verifySignature\|decideAction" app lib`
Expected: `verifySignature` is imported by `app/api/github/app/route.ts` (keep). `decideAction` is imported ONLY by `app/api/a/[username]/sync-webhook/route.ts` (being deleted).

- [ ] **Step 2: Delete the route + its test**

```bash
git rm app/api/a/[username]/sync-webhook/route.ts
git rm tests/app/api/a/sync-webhook.test.ts 2>/dev/null || true
```

- [ ] **Step 3: Remove `decideAction` (+ its types) from `lib/auto-sync/verify.ts`**

Delete `DecideInput`, `Decision`, and `decideAction`. Leave `verifySignature` intact. Remove the now-dead `decideAction` cases from `tests/lib/auto-sync/verify.test.ts`.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/lib/auto-sync/verify.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean (no dangling import of `decideAction`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(auto-sync): remove per-account webhook route + decideAction"
```

---

### Task 9: Drop the secret surface from the auto-sync admin route

**Files:**
- Modify: `app/api/a/[username]/admin/auto-sync/route.ts`
- Modify: `tests/app/api/a/admin-auto-sync.test.ts` (existing — drop secret/regenerate/webhookUrl assertions)

- [ ] **Step 1: Update `view()` and remove the `regenerate` action**

Remove `webhookUrl`, `secret`, and the `regenerate` case. New `view()`:

```ts
function view(config: PersonaAutoSync | null) {
  return {
    enabled: config?.enabled ?? false,
    configured: config !== null,
    lastDeliveryAt: config?.lastDeliveryAt ?? null,
    connectedViaApp: Boolean(config?.installationId),
    manageUrl: config?.installationId
      ? `https://github.com/settings/installations/${config.installationId}`
      : null,
    appInstallUrl: appInstallUrl(),
  };
}
```

Drop the `regenerateSecret` import and the `webhookUrlFor` import. The `POST` switch keeps only `enable` / `disable` (both still valid for App-connected accounts as pause/resume); the `regenerate` case and `view()`'s `username` param go away.

- [ ] **Step 2: Update the test**

Remove assertions on `secret`, `webhookUrl`, and the `regenerate` action; keep `enable`/`disable`/`connectedViaApp` cases.

- [ ] **Step 3: Verify**

Run: `pnpm vitest run tests/app/api/a/admin-auto-sync.test.ts && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/a/[username]/admin/auto-sync/route.ts tests/app/api/a/auto-sync.test.ts
git commit -m "refactor(auto-sync): drop secret/webhook surface from admin route"
```

---

### Task 10: Delete the `ManualWebhook` UI

**Files:**
- Modify: `components/admin/auto-sync-panel.tsx` (remove `ManualWebhook`, `CopyRow`, the `webhook`/`advancedWebhook` branches, and `secret`/`webhookUrl` from the `View` type)
- Modify: `tests/components/admin/auto-sync-panel.test.tsx` (drop webhook/secret/regenerate cases)
- Modify: `components/admin/kb-setup-steps.tsx` (the "or paste the repo URL manually" `<details>` stays — it uses `ManualSyncForm`, not the webhook — no change needed beyond Task 5)

- [ ] **Step 1: Trim the `View` type and the render branches**

In `auto-sync-panel.tsx`: delete `secret` and `webhookUrl` from `View`; delete the `webhook`, `advancedWebhook`, `ManualWebhook`, and `CopyRow` definitions; delete `copied`/`copy` state. In the App-connected branch, remove `{advancedWebhook}`. In the `appInstallUrl` branch, replace the `{advancedWebhook ?? (...)}` block with just the existing "Off — connect the App above" hint. In the final else branch (no App configured), replace `{webhook ?? (...)}` with the plain "Off — the live page only updates on a manual Sync." hint.

- [ ] **Step 2: Update the test**

Remove assertions that render the manual webhook (payload URL, secret, regenerate, gh command). Keep: App-connected state, paused state, appInstallUrl CTA, lastDelivery.

- [ ] **Step 3: Verify**

Run: `pnpm vitest run tests/components/admin/auto-sync-panel.test.tsx && pnpm typecheck`
Expected: PASS; clean.

- [ ] **Step 4: Commit**

```bash
git add components/admin/auto-sync-panel.tsx tests/components/admin/auto-sync-panel.test.tsx
git commit -m "refactor(auto-sync): remove manual-webhook UI"
```

---

### Task 11: Remove secret generation + drop the column

**Files:**
- Delete: `lib/auto-sync/url.ts` (`webhookUrlFor` — no consumers after Task 9)
- Modify: `lib/auto-sync/repo.ts` (remove `generateSecret`, `regenerateSecret`; `enableAutoSync` insert stops setting `secret`)
- Modify: `lib/github-app/repo.ts` (`connectInstallation` insert stops setting `secret`; drop the `generateSecret` import)
- Modify: `lib/db/schema.ts` (remove the `secret` column from `personaAutoSync`)
- Create: a Drizzle migration that drops `persona_auto_sync.secret`
- Delete: `tests/lib/auto-sync/url.test.ts` (tests the removed `webhookUrlFor`)
- Modify: `tests/lib/auto-sync/repo.test.ts` (drop `generateSecret`/`regenerateSecret` cases; `enableAutoSync` no longer returns a `secret`)
- Modify: `tests/lib/github-app/repo.test.ts` (`connectInstallation` no longer writes a `secret`)

- [ ] **Step 1: Confirm `secret` has no readers**

Run: `grep -rn "\.secret\b\|generateSecret\|regenerateSecret\|webhookUrlFor" app lib components tests`
Expected: only the definitions about to be removed (no live readers). If anything else reads `secret`, stop and resolve it first.

- [ ] **Step 2: Make the column nullable-then-drop in schema + migration**

The column is currently `secret: text("secret").notNull()`. Inserts in `enableAutoSync` and `connectInstallation` set it. After removing those writes (Step 3), generate the migration:

```bash
# Remove the `secret` line from personaAutoSync in lib/db/schema.ts first, then:
pnpm db:generate            # drizzle-kit generate (per package.json)
# apply later, against the target DB:
pnpm db:migrate             # tsx scripts/migrate.ts
```

Confirm the generated SQL is `ALTER TABLE "persona_auto_sync" DROP COLUMN "secret";` and nothing else destructive.

- [ ] **Step 3: Remove the secret writes + helpers**

- `lib/auto-sync/repo.ts`: delete `generateSecret` and `regenerateSecret`; change `enableAutoSync`'s insert from `.values({ accountId, enabled: true, secret: generateSecret() })` to `.values({ accountId, enabled: true })`.
- `lib/github-app/repo.ts`: change `connectInstallation`'s insert from `.values({ accountId, enabled: true, secret: generateSecret(), installationId })` to `.values({ accountId, enabled: true, installationId })`; drop the `generateSecret` import (keep `getAutoSyncConfig`).
- `git rm lib/auto-sync/url.ts` and its test if present.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm vitest run tests/lib/auto-sync tests/lib/github-app tests/app/api/github/app-webhook.test.ts`
Expected: PASS; clean. Apply the migration to a local/dev DB and confirm the App install→sync path still works end-to-end (the App path never used `secret`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(auto-sync): drop per-account secret column and helpers"
```

---

### Phase 2 gate

- [ ] `pnpm typecheck` clean; full `pnpm vitest run` green.
- [ ] Migration applied to dev DB; App install → push → sync verified.
- [ ] Settings → Content source UI shows only: App connect / connected+manage / paused, plus the `ManualSyncForm` paste fallback. No secret, no webhook URL, no regenerate.

---

## Self-Review

**1. Spec coverage**
- "Agent registers repo programmatically" → Tasks 1–4 (token primitive, guard, persona-source acceptance, mint endpoint).
- "Credential in the prompt" → Tasks 4–5 (mint + `buildAgentPrompt` with the bearer `curl`).
- "App is the single push mechanism / keep only the App" → Phase 2 (Tasks 8–11) removes the manual webhook.
- "One human step = App install" → Task 6 preamble + Task 5 prompt step 4.
- "Confirm no stranded users before deleting" → Task 7 gate.

**2. Placeholder scan** — No "TBD"/"handle errors"/"similar to" left; every code step has full code. The one intentionally environment-specific step is the Drizzle generate command (Task 11 Step 2), which defers to the repo's actual migration script — flagged inline, not a hidden placeholder.

**3. Type consistency**
- `createSetupToken`/`verifySetupToken`/`SETUP_TOKEN_TTL_MS` are defined in Task 1 and consumed with the same signatures in Tasks 2, 4, 5.
- `resolveAccountAdminViaSessionOrToken(slug, req)` defined in Task 2, consumed in Task 3; returns the existing `AdminResolution` union from `resolve.ts`.
- `buildAgentPrompt({origin, username, token, appInstallUrl})` defined in Task 5, consumed by the component in the same task.
- `view(config)` in Task 9 drops the `username` param — Task 9 also updates both call sites (`GET` and `POST`) accordingly.

**Open risks (carry into execution):**
- **Token leakage:** the token rides in a copy-pasted prompt. Mitigated by 60-min TTL, narrow scope (persona-source only, one account), and rate-limited minting. Residual risk: within the window a leaked token could repoint the persona to another public repo; the owner can immediately re-sync. Acceptable; revisit if abuse appears.
- **Existing-suite mocks (Task 3):** the persona-source test must mock the guard's transitive deps. If the existing suite's structure differs, adapt the mocks rather than the assertion.

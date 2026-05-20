# Admin Dashboard + Ops CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Alexandre a read-only web dashboard at `/admin` to observe conversations, askers, and forwarded questions, plus a scriptable `pnpm admin` CLI that is the sole write path for edits and FK-safe deletes.

**Architecture:** The web admin is a set of Next.js App Router server components under `app/admin/*` that read Postgres directly through Drizzle via new functions in `lib/admin/queries.ts`; it performs no writes. A signed, stateless HMAC session cookie (`lib/admin/auth.ts`) gates `/admin/*` and `/api/admin/*` through `middleware.ts`. The ops CLI (`scripts/admin.ts`) is a dependency-free `process.argv` dispatcher loading `.env.local` and connecting via `getDb()`; its command handlers live in `lib/cli/commands.ts` so they are unit-testable with an injected db.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Drizzle ORM (Neon HTTP), `node:crypto` HMAC + Web Crypto in middleware, zod, vitest, Tailwind v4, `tsx`.

**Starts from:** main branch (Plan 2 shipped).

---

## File structure produced by this plan

```
queryme/
├── .env.example                          # Modified Task 1 — ADMIN_PASSWORD, ADMIN_SESSION_SECRET
├── package.json                          # Modified Task 8 — "admin" script
├── middleware.ts                         # Task 4 — guards /admin/* and /api/admin/*
├── README.md                             # Modified Task 13 — document /admin + pnpm admin
│
├── lib/
│   ├── admin/
│   │   ├── auth.ts                        # Task 2 — signSession / verifySession (HMAC)
│   │   ├── auth.edge.ts                   # Task 4 — verifySessionEdge (Web Crypto, middleware)
│   │   └── queries.ts                     # Task 5 — dashboard read functions
│   ├── cli/
│   │   └── commands.ts                    # Task 7 — CLI command handlers (injected db)
│   ├── conversations/
│   │   └── repo.ts                        # Modified Task 6 — + listConversations, getConversationById, deleteConversation
│   ├── askers/
│   │   └── repo.ts                        # Task 6 — listAskers, getAskerById, deleteAsker
│   └── questions/
│       └── repo.ts                        # Modified Task 6 — + listAllQuestions, getQuestionById, markQuestionAnswered, deleteQuestionsForConversation, deleteQuestionsForAsker
│
├── scripts/
│   └── admin.ts                           # Task 8 — CLI dispatcher
│
├── app/
│   ├── admin/
│   │   ├── layout.tsx                     # Task 9 — admin shell (nav + logout)
│   │   ├── page.tsx                       # Task 9 — overview (counts + recent activity)
│   │   ├── login/
│   │   │   └── page.tsx                   # Task 3 — password form
│   │   ├── conversations/
│   │   │   ├── page.tsx                   # Task 10 — conversation list
│   │   │   └── [id]/page.tsx              # Task 10 — full transcript
│   │   ├── askers/
│   │   │   └── page.tsx                   # Task 11 — asker list
│   │   └── questions/
│   │       └── page.tsx                   # Task 12 — forwarded-question list
│   └── api/
│       └── admin/
│           ├── login/route.ts             # Task 3 — POST → set cookie
│           └── logout/route.ts            # Task 3 — POST → clear cookie
│
└── tests/
    ├── lib/
    │   ├── admin/
    │   │   └── auth.test.ts                # Task 2
    │   └── cli/
    │       └── commands.test.ts            # Task 7
    └── app/api/admin/
        └── login/route.test.ts             # Task 3
```

**Conventions:**
- TDD strictly where there is testable logic: failing test → run it (see it fail) → implement → run it (see it pass). Do not skip the failing-test step.
- Commit after each task with the message in the task's final step.
- All paths relative to `/Users/alexandrecollet/queryme`. Run every command from the repo root.
- `pnpm` is the package manager. `pnpm test` = `vitest run --passWithNoTests`; `pnpm typecheck` = `tsc --noEmit`.
- DB-touching repo functions follow Plan 2's precedent — no live-Postgres integration tests; correctness is via schema parity (Drizzle) and manual smoke. They still get complete implementations.
- The web admin performs **no writes**. The CLI is the only write path.

---

## Task 1: Add admin env vars

No tests; this is configuration. Success criterion: `pnpm typecheck` + `pnpm test` still pass.

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append admin env vars to `.env.example`**

Open `.env.example`. Append below the existing entries:

```bash

# --- Plan 4: admin dashboard + ops CLI ---

# Password for the /admin login form (server-only, never shipped to the client)
ADMIN_PASSWORD=

# Secret used to HMAC-sign the admin session cookie (server-only).
# Generate with: openssl rand -hex 32
ADMIN_SESSION_SECRET=
```

- [ ] **Step 2: Verify nothing is broken**

```bash
pnpm typecheck
pnpm test
```

Expected: typecheck clean, all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(admin): add ADMIN_PASSWORD + ADMIN_SESSION_SECRET env stubs"
```

---

## Task 2: Session cookie sign / verify (HMAC, Node runtime)

The session cookie is stateless: a payload `{ exp }` (epoch-ms expiry) encoded as base64url, followed by a `.` separator and a base64url HMAC-SHA256 of that payload using `ADMIN_SESSION_SECRET`. `verifySession` rejects malformed input, bad signatures (constant-time compare), and expired payloads. TTL is 7 days. This module is `node:crypto`-based and used by the route handlers; the Edge-runtime variant for middleware comes in Task 4.

**Files:**
- Create: `lib/admin/auth.ts`
- Create: `tests/lib/admin/auth.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/admin/auth.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySession, SESSION_TTL_MS } from "@/lib/admin/auth";

const SECRET = "test-secret-0123456789abcdef";

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

describe("signSession / verifySession", () => {
  it("a freshly signed cookie verifies", () => {
    const cookie = signSession();
    expect(verifySession(cookie)).toBe(true);
  });

  it("rejects undefined / empty input", () => {
    expect(verifySession(undefined)).toBe(false);
    expect(verifySession("")).toBe(false);
  });

  it("rejects a malformed cookie (no separator)", () => {
    expect(verifySession("garbage")).toBe(false);
  });

  it("rejects a cookie with a tampered payload", () => {
    const cookie = signSession();
    const [, sig] = cookie.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }),
    ).toString("base64url");
    expect(verifySession(`${forgedPayload}.${sig}`)).toBe(false);
  });

  it("rejects a cookie with a tampered signature", () => {
    const cookie = signSession();
    const [payload] = cookie.split(".");
    expect(verifySession(`${payload}.deadbeef`)).toBe(false);
  });

  it("rejects an expired cookie", () => {
    const expiredPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() - 1000 }),
    ).toString("base64url");
    // Sign the expired payload with the real secret so only expiry fails.
    const crypto = require("node:crypto");
    const sig = crypto
      .createHmac("sha256", SECRET)
      .update(expiredPayload)
      .digest("base64url");
    expect(verifySession(`${expiredPayload}.${sig}`)).toBe(false);
  });

  it("verifySession is false when the secret differs", () => {
    const cookie = signSession();
    process.env.ADMIN_SESSION_SECRET = "a-completely-different-secret";
    expect(verifySession(cookie)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — see it fail**

```bash
pnpm test tests/lib/admin/auth.test.ts
```

Expected: fails — `lib/admin/auth.ts` does not exist yet.

- [ ] **Step 3: Write `lib/admin/auth.ts`**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE_NAME = "admin_session";

type SessionPayload = { exp: number };

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Configure it in .env.local (local) or Vercel env (production).",
    );
  }
  return secret;
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Returns a `<payload>.<signature>` cookie value valid for SESSION_TTL_MS. */
export function signSession(): string {
  const payload: SessionPayload = { exp: Date.now() + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(encoded, getSecret())}`;
}

/** True only if the cookie is well-formed, signed by our secret, and unexpired. */
export function verifySession(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot <= 0 || dot === cookie.length - 1) return false;

  const encoded = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);

  let expected: string;
  try {
    expected = hmac(encoded, getSecret());
  } catch {
    return false;
  }

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!timingSafeEqual(sigBuf, expBuf)) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof payload.exp !== "number") return false;
  return payload.exp > Date.now();
}
```

- [ ] **Step 4: Run the test — see it pass**

```bash
pnpm test tests/lib/admin/auth.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/auth.ts tests/lib/admin/auth.test.ts
git commit -m "feat(admin): HMAC-signed session cookie sign/verify"
```

---

## Task 3: Login page + login/logout API routes

`/admin/login` renders a password form that POSTs to `/api/admin/login`. The route compares the submitted password to `ADMIN_PASSWORD` (constant-time), and on success sets the signed `admin_session` cookie (`httpOnly`, `secure`, `sameSite=lax`, `path=/`, `maxAge` = 7 days). On failure it returns 401 with a generic message. `/api/admin/logout` clears the cookie. The login page is a client component that shows an inline error on a wrong password and redirects to `/admin` on success.

**Files:**
- Create: `app/api/admin/login/route.ts`
- Create: `app/api/admin/logout/route.ts`
- Create: `app/admin/login/page.tsx`
- Create: `tests/app/api/admin/login/route.test.ts`

- [ ] **Step 1: Write the failing test `tests/app/api/admin/login/route.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/login/route";
import { SESSION_COOKIE_NAME } from "@/lib/admin/auth";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse";
  process.env.ADMIN_SESSION_SECRET = "test-secret-0123456789abcdef";
});

describe("POST /api/admin/login", () => {
  it("400s on an invalid body shape", async () => {
    const res = await POST(makeRequest({ nope: true }));
    expect(res.status).toBe(400);
  });

  it("401s on a wrong password and sets no cookie", async () => {
    const res = await POST(makeRequest({ password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("200s on the correct password and sets an httpOnly session cookie", async () => {
    const res = await POST(makeRequest({ password: "correct horse" }));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("lax");
    expect(cookie!.value.includes(".")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — see it fail**

```bash
pnpm test tests/app/api/admin/login/route.test.ts
```

Expected: fails — `app/api/admin/login/route.ts` does not exist yet.

- [ ] **Step 3: Write `app/api/admin/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { signSession, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/admin/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ password: z.string().min(1) });

function passwordMatches(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape" }, { status: 400 });
  }

  if (!passwordMatches(parsed.data.password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, signSession(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
```

- [ ] **Step 4: Write `app/api/admin/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
```

- [ ] **Step 5: Write `app/admin/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      setError("Incorrect password.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          Queryme
        </span>
        <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
          Admin sign in
        </h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="h-10 rounded-lg border border-[var(--color-border)] bg-transparent px-3 text-[14px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={submitting || password.length === 0}
          className="h-10 rounded-full bg-[var(--color-accent)] font-display text-[13px] font-medium text-[var(--color-void)] transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-[13px] text-red-500">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Run the test — see it pass**

```bash
pnpm test tests/app/api/admin/login/route.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/login/route.ts app/api/admin/logout/route.ts app/admin/login/page.tsx tests/app/api/admin/login/route.test.ts
git commit -m "feat(admin): login page + login/logout API routes"
```

---

## Task 4: Edge-runtime cookie verification + middleware guard

`middleware.ts` runs on the Edge runtime, where `node:crypto` is unavailable. We therefore implement an async `verifySessionEdge` in `lib/admin/auth.edge.ts` using Web Crypto (`crypto.subtle`). The middleware guards `/admin/*` and `/api/admin/*`, **excluding** `/admin/login` and `/api/admin/login` (otherwise no one could ever sign in). An unauthenticated `/admin/*` request redirects to `/admin/login`; an unauthenticated `/api/admin/*` request returns a 401 JSON response.

- [ ] **Step 1: Write `lib/admin/auth.edge.ts`**

```typescript
import { SESSION_COOKIE_NAME } from "@/lib/admin/auth";

export { SESSION_COOKIE_NAME };

function base64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Edge-runtime equivalent of verifySession, using Web Crypto. */
export async function verifySessionEdge(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot <= 0 || dot === cookie.length - 1) return false;

  const encoded = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;

  let expected: string;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encoded),
    );
    expected = bytesToBase64url(sigBuf);
  } catch {
    return false;
  }

  if (!timingSafeEqualStr(signature, expected)) return false;

  let payload: { exp?: unknown };
  try {
    const json = new TextDecoder().decode(base64urlToBytes(encoded));
    payload = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof payload.exp !== "number") return false;
  return payload.exp > Date.now();
}
```

- [ ] **Step 2: Write `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySessionEdge, SESSION_COOKIE_NAME } from "@/lib/admin/auth.edge";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

function isPublicPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/api/admin/login";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionEdge(cookie);
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Build to confirm the middleware compiles for the Edge runtime**

```bash
pnpm build
```

Expected: build succeeds; the build log lists `ƒ Middleware` with no `node:crypto` errors. (If `validate:kb` fails for unrelated reasons, fix that separately — the middleware compilation is what matters here.)

- [ ] **Step 5: Commit**

```bash
git add lib/admin/auth.edge.ts middleware.ts
git commit -m "feat(admin): Edge-runtime session verification + middleware guard"
```

---

## Task 5: Dashboard read queries

`lib/admin/queries.ts` holds read-only aggregate queries used by the server-component pages: counts for the overview and a recent-activity list. It depends on the repo `list*` functions added in Task 6 — so this task is written but its functions reference Task 6 helpers. To keep tasks independently completable, this task **also** defines the small helpers it needs inline rather than waiting on Task 6; Task 6 then adds the per-entity repos that the CLI and detail pages use. There is no overlap: `queries.ts` is admin-overview-specific.

**Files:**
- Create: `lib/admin/queries.ts`

- [ ] **Step 1: Write `lib/admin/queries.ts`**

```typescript
import { desc, count } from "drizzle-orm";
import { conversations, askers, questionsForAlex } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type AdminOverview = {
  conversationCount: number;
  askerCount: number;
  openQuestionCount: number;
  recentConversations: {
    id: string;
    channel: "chat" | "mcp";
    turnCount: number;
    lastMessageAt: Date;
  }[];
};

export async function getAdminOverview(db: Db): Promise<AdminOverview> {
  const [convRows] = await db.select({ value: count() }).from(conversations);
  const [askerRows] = await db.select({ value: count() }).from(askers);
  const [openQRows] = await db
    .select({ value: count() })
    .from(questionsForAlex);

  // openQuestionCount: count of rows with answeredAt IS NULL.
  const allQuestions = await db
    .select({ answeredAt: questionsForAlex.answeredAt })
    .from(questionsForAlex);
  const openQuestionCount = allQuestions.filter((q) => q.answeredAt === null).length;
  void openQRows;

  const recent = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      transcript: conversations.transcript,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(10);

  return {
    conversationCount: convRows.value,
    askerCount: askerRows.value,
    openQuestionCount,
    recentConversations: recent.map((c) => ({
      id: c.id,
      channel: c.channel,
      turnCount: Array.isArray(c.transcript) ? c.transcript.length : 0,
      lastMessageAt: c.lastMessageAt,
    })),
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/queries.ts
git commit -m "feat(admin): dashboard overview read query"
```

---

## Task 6: Repo functions for list / get / delete / answer

Add the CRUD-read and FK-safe write functions the CLI and detail pages need. Conversations and questions extend their existing repos; askers get a new repo at `lib/askers/repo.ts`. Deletes are FK-safe: `questions_for_alex` rows reference both `conversations` and `askers`; we delete those referencing rows first. A conversation also carries an `askerId` FK, and a question carries a `conversationId` FK — so deleting an asker must first delete its questions and null out `conversations.askerId`.

**Files:**
- Modify: `lib/conversations/repo.ts`
- Create: `lib/askers/repo.ts`
- Modify: `lib/questions/repo.ts`

- [ ] **Step 1: Append to `lib/conversations/repo.ts`**

Add these imports — change the existing first line:

```typescript
import { eq, sql, desc } from "drizzle-orm";
```

Then append at the end of the file:

```typescript
export async function listConversations(db: Db): Promise<Conversation[]> {
  return await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.lastMessageAt));
}

export async function getConversationById(
  db: Db,
  id: string,
): Promise<Conversation | null> {
  const rows = await db.select().from(conversations).where(eq(conversations.id, id));
  return rows[0] ?? null;
}

/**
 * FK-safe delete: a conversation is referenced by questions_for_alex rows.
 * Caller must delete those first (see deleteQuestionsForConversation).
 * Returns true if a row was deleted.
 */
export async function deleteConversation(db: Db, id: string): Promise<boolean> {
  const deleted = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}
```

- [ ] **Step 2: Write `lib/askers/repo.ts`**

```typescript
import { eq, desc } from "drizzle-orm";
import { askers, type Asker } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function listAskers(db: Db): Promise<Asker[]> {
  return await db.select().from(askers).orderBy(desc(askers.createdAt));
}

export async function getAskerById(db: Db, id: string): Promise<Asker | null> {
  const rows = await db.select().from(askers).where(eq(askers.id, id));
  return rows[0] ?? null;
}

/**
 * FK-safe delete: an asker is referenced by conversations.askerId and
 * questions_for_alex.askerId. Caller must clear those references first
 * (see deleteQuestionsForAsker + nullAskerOnConversations).
 * Returns true if a row was deleted.
 */
export async function deleteAsker(db: Db, id: string): Promise<boolean> {
  const deleted = await db
    .delete(askers)
    .where(eq(askers.id, id))
    .returning({ id: askers.id });
  return deleted.length > 0;
}
```

- [ ] **Step 3: Add `nullAskerOnConversations` to `lib/conversations/repo.ts`**

Append at the end of `lib/conversations/repo.ts`:

```typescript
/** Clears the askerId FK on every conversation pointing at the given asker. */
export async function nullAskerOnConversations(
  db: Db,
  askerId: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ askerId: null })
    .where(eq(conversations.askerId, askerId));
}
```

- [ ] **Step 4: Append to `lib/questions/repo.ts`**

Change the existing first line to add `eq`:

```typescript
import { desc, isNull, eq } from "drizzle-orm";
```

Then append at the end of the file:

```typescript
export async function listAllQuestions(db: Db): Promise<QuestionForAlex[]> {
  return await db
    .select()
    .from(questionsForAlex)
    .orderBy(desc(questionsForAlex.createdAt));
}

export async function getQuestionById(
  db: Db,
  id: string,
): Promise<QuestionForAlex | null> {
  const rows = await db
    .select()
    .from(questionsForAlex)
    .where(eq(questionsForAlex.id, id));
  return rows[0] ?? null;
}

/** Sets answeredAt = now() on the question. Returns true if a row matched. */
export async function markQuestionAnswered(db: Db, id: string): Promise<boolean> {
  const updated = await db
    .update(questionsForAlex)
    .set({ answeredAt: new Date() })
    .where(eq(questionsForAlex.id, id))
    .returning({ id: questionsForAlex.id });
  return updated.length > 0;
}

/** Deletes every forwarded question referencing the given conversation. */
export async function deleteQuestionsForConversation(
  db: Db,
  conversationId: string,
): Promise<void> {
  await db
    .delete(questionsForAlex)
    .where(eq(questionsForAlex.conversationId, conversationId));
}

/** Deletes every forwarded question referencing the given asker. */
export async function deleteQuestionsForAsker(
  db: Db,
  askerId: string,
): Promise<void> {
  await db.delete(questionsForAlex).where(eq(questionsForAlex.askerId, askerId));
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Run the full suite (no regressions)**

```bash
pnpm test
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add lib/conversations/repo.ts lib/askers/repo.ts lib/questions/repo.ts
git commit -m "feat(repo): list/get/delete + FK-safe helpers + markQuestionAnswered"
```

---

## Task 7: CLI command handlers

`lib/cli/commands.ts` holds the dispatch logic, separated from `scripts/admin.ts` so it is unit-testable with a stubbed db. `runCommand(db, argv, io)` takes the db, the argument list (everything after `node admin.ts`), and an `io` object with `out`/`err` writers — so tests assert on captured output and the returned exit code without touching `console` or a live Postgres. Unknown commands and missing args produce a usage message and exit code 1; unknown ids produce a "not found" message and exit code 1; success produces a confirmation line and exit code 0.

**Files:**
- Create: `lib/cli/commands.ts`
- Create: `tests/lib/cli/commands.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/cli/commands.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { runCommand, type CliIo } from "@/lib/cli/commands";

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };
  return { io, out, err };
}

/** A db stub that records calls; only the methods a command needs are stubbed. */
function makeDbStub(overrides: Record<string, unknown> = {}) {
  return { __stub: true, ...overrides } as never;
}

describe("runCommand — argument parsing & dispatch", () => {
  it("no arguments → usage + exit 1", async () => {
    const { io, err } = makeIo();
    const code = await runCommand(makeDbStub(), [], io);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/usage/i);
  });

  it("unknown command → usage + exit 1", async () => {
    const { io, err } = makeIo();
    const code = await runCommand(makeDbStub(), ["frobnicate"], io);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/usage/i);
  });

  it("`conversation show` with no id → error + exit 1", async () => {
    const { io, err } = makeIo();
    const code = await runCommand(makeDbStub(), ["conversation", "show"], io);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/id/i);
  });

  it("`conversations list` prints rows and exits 0", async () => {
    const { io, out } = makeIo();
    const code = await runCommand(
      makeDbStub({
        __conversations: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            channel: "chat",
            askerId: null,
            transcript: [{ role: "user", text: "hi", at: "x" }],
            lastMessageAt: new Date("2026-05-20T10:00:00Z"),
          },
        ],
      }),
      ["conversations", "list"],
      io,
      { listConversations: async () => [
        {
          id: "11111111-1111-1111-1111-111111111111",
          channel: "chat" as const,
          askerId: null,
          language: null,
          transcript: [{ role: "user" as const, text: "hi", at: "x" }],
          sensitiveUnlockedAt: null,
          startedAt: new Date(),
          lastMessageAt: new Date("2026-05-20T10:00:00Z"),
        },
      ] },
    );
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/11111111/);
  });

  it("`question answer <id>` on an unknown id → not found + exit 1", async () => {
    const { io, err } = makeIo();
    const code = await runCommand(
      makeDbStub(),
      ["question", "answer", "99999999-9999-9999-9999-999999999999"],
      io,
      { markQuestionAnswered: async () => false },
    );
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/not found/i);
  });

  it("`question answer <id>` on a known id → confirmation + exit 0", async () => {
    const { io, out } = makeIo();
    const code = await runCommand(
      makeDbStub(),
      ["question", "answer", "22222222-2222-2222-2222-222222222222"],
      io,
      { markQuestionAnswered: async () => true },
    );
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/answered/i);
  });
});
```

- [ ] **Step 2: Run the test — see it fail**

```bash
pnpm test tests/lib/cli/commands.test.ts
```

Expected: fails — `lib/cli/commands.ts` does not exist yet.

- [ ] **Step 3: Write `lib/cli/commands.ts`**

```typescript
import type { getDb } from "@/lib/db/client";
import type { ConversationTurn } from "@/lib/db/schema";
import {
  listConversations as repoListConversations,
  getConversationById as repoGetConversationById,
  deleteConversation as repoDeleteConversation,
  nullAskerOnConversations as repoNullAskerOnConversations,
} from "@/lib/conversations/repo";
import {
  listAskers as repoListAskers,
  getAskerById as repoGetAskerById,
  deleteAsker as repoDeleteAsker,
} from "@/lib/askers/repo";
import {
  listAllQuestions as repoListAllQuestions,
  getQuestionById as repoGetQuestionById,
  markQuestionAnswered as repoMarkQuestionAnswered,
  deleteQuestionsForConversation as repoDeleteQuestionsForConversation,
  deleteQuestionsForAsker as repoDeleteQuestionsForAsker,
} from "@/lib/questions/repo";

type Db = ReturnType<typeof getDb>;

export type CliIo = {
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * Repo functions are injectable so commands can be unit-tested without a live
 * Postgres. Production callers omit `repos` and get the real implementations.
 */
export type CliRepos = {
  listConversations: typeof repoListConversations;
  getConversationById: typeof repoGetConversationById;
  deleteConversation: typeof repoDeleteConversation;
  nullAskerOnConversations: typeof repoNullAskerOnConversations;
  listAskers: typeof repoListAskers;
  getAskerById: typeof repoGetAskerById;
  deleteAsker: typeof repoDeleteAsker;
  listAllQuestions: typeof repoListAllQuestions;
  getQuestionById: typeof repoGetQuestionById;
  markQuestionAnswered: typeof repoMarkQuestionAnswered;
  deleteQuestionsForConversation: typeof repoDeleteQuestionsForConversation;
  deleteQuestionsForAsker: typeof repoDeleteQuestionsForAsker;
};

const DEFAULT_REPOS: CliRepos = {
  listConversations: repoListConversations,
  getConversationById: repoGetConversationById,
  deleteConversation: repoDeleteConversation,
  nullAskerOnConversations: repoNullAskerOnConversations,
  listAskers: repoListAskers,
  getAskerById: repoGetAskerById,
  deleteAsker: repoDeleteAsker,
  listAllQuestions: repoListAllQuestions,
  getQuestionById: repoGetQuestionById,
  markQuestionAnswered: repoMarkQuestionAnswered,
  deleteQuestionsForConversation: repoDeleteQuestionsForConversation,
  deleteQuestionsForAsker: repoDeleteQuestionsForAsker,
};

const USAGE = `Usage: pnpm admin <command>

  conversations list                List all conversations
  conversation show <id>            Print a conversation's full transcript
  conversation delete <id>          Delete a conversation (FK-safe)
  askers list                       List identified askers
  asker delete <id>                 Delete an asker (FK-safe)
  questions list                    List forwarded questions (open vs answered)
  question answer <id>              Mark a forwarded question answered`;

function transcriptLength(t: unknown): number {
  return Array.isArray(t) ? t.length : 0;
}

/**
 * Dispatch a CLI invocation. `argv` is the args after `node admin.ts`.
 * Returns the process exit code (0 = success, 1 = error).
 */
export async function runCommand(
  db: Db,
  argv: string[],
  io: CliIo,
  repos: Partial<CliRepos> = {},
): Promise<number> {
  const r: CliRepos = { ...DEFAULT_REPOS, ...repos };
  const [group, action, ...rest] = argv;

  if (!group) {
    io.err(USAGE);
    return 1;
  }

  // conversations list
  if (group === "conversations" && action === "list") {
    const rows = await r.listConversations(db);
    if (rows.length === 0) {
      io.out("No conversations.");
      return 0;
    }
    for (const c of rows) {
      io.out(
        `${c.id}  ${c.channel.padEnd(4)}  asker=${c.askerId ?? "-"}  turns=${transcriptLength(
          c.transcript,
        )}  last=${new Date(c.lastMessageAt).toISOString()}`,
      );
    }
    return 0;
  }

  // conversation show <id> | conversation delete <id>
  if (group === "conversation") {
    const id = rest[0];
    if (!id) {
      io.err("Missing <id>.\n\n" + USAGE);
      return 1;
    }
    if (action === "show") {
      const conv = await r.getConversationById(db, id);
      if (!conv) {
        io.err(`Conversation ${id} not found.`);
        return 1;
      }
      io.out(`Conversation ${conv.id}`);
      io.out(`  channel: ${conv.channel}   asker: ${conv.askerId ?? "-"}`);
      io.out(`  started: ${new Date(conv.startedAt).toISOString()}`);
      io.out("  transcript:");
      const turns = (conv.transcript ?? []) as ConversationTurn[];
      for (const t of turns) {
        io.out(`    [${t.role}] ${t.text}`);
      }
      return 0;
    }
    if (action === "delete") {
      // FK-safe: remove referencing questions_for_alex rows first.
      await r.deleteQuestionsForConversation(db, id);
      const deleted = await r.deleteConversation(db, id);
      if (!deleted) {
        io.err(`Conversation ${id} not found.`);
        return 1;
      }
      io.out(`Deleted conversation ${id}.`);
      return 0;
    }
    io.err(USAGE);
    return 1;
  }

  // askers list
  if (group === "askers" && action === "list") {
    const rows = await r.listAskers(db);
    if (rows.length === 0) {
      io.out("No askers.");
      return 0;
    }
    for (const a of rows) {
      io.out(
        `${a.id}  ${a.name}  ${a.company}  ${a.workEmail}  verified=${
          a.verifiedAt ? "yes" : "no"
        }`,
      );
    }
    return 0;
  }

  // asker delete <id>
  if (group === "asker" && action === "delete") {
    const id = rest[0];
    if (!id) {
      io.err("Missing <id>.\n\n" + USAGE);
      return 1;
    }
    // FK-safe: clear questions_for_alex + conversations references first.
    await r.deleteQuestionsForAsker(db, id);
    await r.nullAskerOnConversations(db, id);
    const deleted = await r.deleteAsker(db, id);
    if (!deleted) {
      io.err(`Asker ${id} not found.`);
      return 1;
    }
    io.out(`Deleted asker ${id}.`);
    return 0;
  }

  // questions list
  if (group === "questions" && action === "list") {
    const rows = await r.listAllQuestions(db);
    if (rows.length === 0) {
      io.out("No forwarded questions.");
      return 0;
    }
    for (const q of rows) {
      io.out(
        `${q.id}  [${q.answeredAt ? "answered" : "open"}]  ${q.question}`,
      );
    }
    return 0;
  }

  // question answer <id>
  if (group === "question" && action === "answer") {
    const id = rest[0];
    if (!id) {
      io.err("Missing <id>.\n\n" + USAGE);
      return 1;
    }
    const ok = await r.markQuestionAnswered(db, id);
    if (!ok) {
      io.err(`Question ${id} not found.`);
      return 1;
    }
    io.out(`Marked question ${id} answered.`);
    return 0;
  }

  io.err(USAGE);
  return 1;
}
```

- [ ] **Step 4: Run the test — see it pass**

```bash
pnpm test tests/lib/cli/commands.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/cli/commands.ts tests/lib/cli/commands.test.ts
git commit -m "feat(cli): command handlers with injectable repos"
```

---

## Task 8: CLI dispatcher script + `pnpm admin`

`scripts/admin.ts` is the thin executable: it loads `.env.local` (guarded by `fs.existsSync`, same pattern as `scripts/migrate.ts`), connects via `getDb()`, slices `process.argv`, calls `runCommand`, and exits with the returned code. Add the `"admin"` script to `package.json`.

**Files:**
- Create: `scripts/admin.ts`
- Modify: `package.json`

- [ ] **Step 1: Write `scripts/admin.ts`**

```typescript
import fs from "node:fs";
import { getDb } from "@/lib/db/client";
import { runCommand } from "@/lib/cli/commands";

// Standalone via `tsx` — load .env.local so getDb() finds POSTGRES_URL,
// the same pattern scripts/migrate.ts uses.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const db = getDb();
  // process.argv = [node, admin.ts, ...userArgs]
  const argv = process.argv.slice(2);
  const code = await runCommand(db, argv, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
  process.exit(code);
}

main().catch((err) => {
  console.error("admin CLI failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the `admin` script to `package.json`**

In the `"scripts"` block, add this line after `"db:migrate"`:

```json
    "admin": "tsx scripts/admin.ts"
```

The block becomes:

```json
  "scripts": {
    "dev": "env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL next dev",
    "build": "pnpm validate:kb && next build",
    "start": "env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL next start",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "validate:kb": "tsx scripts/validate-kb.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "admin": "tsx scripts/admin.ts"
  },
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Smoke-test the dispatcher (no DB needed for the usage path)**

```bash
pnpm admin
```

Expected: prints the usage message to stderr and exits non-zero. (`echo $?` shows `1`.)

- [ ] **Step 5: Commit**

```bash
git add scripts/admin.ts package.json
git commit -m "feat(cli): admin dispatcher script + pnpm admin"
```

---

## Task 9: Admin shell layout + overview page

`app/admin/layout.tsx` is the shared shell: a top nav linking the four sections and a logout button (a tiny client component that POSTs to `/api/admin/logout`). It does **not** wrap `/admin/login` differently — the login page is rendered inside this layout too, which is fine since the layout has no auth logic (middleware does the gating). `app/admin/page.tsx` is a server component that reads `getAdminOverview` and shows counts plus recent conversations.

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/logout-button.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Write `app/admin/logout-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={handleLogout}
      className="font-mono text-[11px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
      style={{ letterSpacing: "0.18em" }}
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 2: Write `app/admin/layout.tsx`**

```tsx
import Link from "next/link";
import { LogoutButton } from "./logout-button";

const NAV: { href: "/admin" | "/admin/conversations" | "/admin/askers" | "/admin/questions"; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/conversations", label: "Conversations" },
  { href: "/admin/askers", label: "Askers" },
  { href: "/admin/questions", label: "Questions" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between gap-6 border-b border-[var(--color-border)] pb-4">
        <nav className="flex flex-wrap items-center gap-5">
          <span
            className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            Queryme Admin
          </span>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-display text-[13px] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <LogoutButton />
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write `app/admin/page.tsx`**

```tsx
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { getAdminOverview } from "@/lib/admin/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] p-4">
      <span
        className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.2em" }}
      >
        {label}
      </span>
      <span className="font-display text-[28px] font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const db = getDb();
  const overview = await getAdminOverview(db);

  return (
    <>
      <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
        Overview
      </h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Conversations" value={overview.conversationCount} />
        <StatCard label="Askers" value={overview.askerCount} />
        <StatCard label="Open questions" value={overview.openQuestionCount} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-medium text-[var(--color-text-primary)]">
          Recent conversations
        </h2>
        {overview.recentConversations.length === 0 ? (
          <p className="text-[13px] text-[var(--color-text-tertiary)]">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {overview.recentConversations.map((c) => (
              <li key={c.id} className="py-2 text-[13px]">
                <Link
                  href={`/admin/conversations/${c.id}`}
                  className="text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
                >
                  <span className="font-mono">{c.id.slice(0, 8)}</span>
                  {" · "}
                  {c.channel} · {c.turnCount} turns ·{" "}
                  {new Date(c.lastMessageAt).toISOString().slice(0, 16).replace("T", " ")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: clean. (`typedRoutes` is on — the `NAV` href union and the template-literal `/admin/conversations/${c.id}` are accepted.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx app/admin/logout-button.tsx app/admin/page.tsx
git commit -m "feat(admin): admin shell layout + overview page"
```

---

## Task 10: Conversations list + transcript pages

`app/admin/conversations/page.tsx` lists all conversations in a table. `app/admin/conversations/[id]/page.tsx` shows one conversation's full transcript; an unknown id calls `notFound()`.

**Files:**
- Create: `app/admin/conversations/page.tsx`
- Create: `app/admin/conversations/[id]/page.tsx`

- [ ] **Step 1: Write `app/admin/conversations/page.tsx`**

```tsx
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listConversations } from "@/lib/conversations/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const db = getDb();
  const conversations = await listConversations(db);

  return (
    <>
      <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
        Conversations
      </h1>
      {conversations.length === 0 ? (
        <p className="text-[13px] text-[var(--color-text-tertiary)]">No conversations yet.</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-tertiary)]">
              <th className="py-2 font-mono text-[10px] uppercase">ID</th>
              <th className="py-2 font-mono text-[10px] uppercase">Channel</th>
              <th className="py-2 font-mono text-[10px] uppercase">Turns</th>
              <th className="py-2 font-mono text-[10px] uppercase">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id} className="border-b border-[var(--color-border)]">
                <td className="py-2">
                  <Link
                    href={`/admin/conversations/${c.id}`}
                    className="font-mono text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
                  >
                    {c.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-2 text-[var(--color-text-secondary)]">{c.channel}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">
                  {Array.isArray(c.transcript) ? c.transcript.length : 0}
                </td>
                <td className="py-2 text-[var(--color-text-secondary)]">
                  {new Date(c.lastMessageAt).toISOString().slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write `app/admin/conversations/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getConversationById } from "@/lib/conversations/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const conversation = await getConversationById(db, id);
  if (!conversation) notFound();

  const turns = conversation.transcript ?? [];

  return (
    <>
      <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
        Conversation
      </h1>
      <dl className="flex flex-col gap-1 text-[13px] text-[var(--color-text-secondary)]">
        <div>
          <span className="font-mono text-[var(--color-text-tertiary)]">id: </span>
          <span className="font-mono">{conversation.id}</span>
        </div>
        <div>
          <span className="font-mono text-[var(--color-text-tertiary)]">channel: </span>
          {conversation.channel}
        </div>
        <div>
          <span className="font-mono text-[var(--color-text-tertiary)]">asker: </span>
          {conversation.askerId ?? "—"}
        </div>
        <div>
          <span className="font-mono text-[var(--color-text-tertiary)]">started: </span>
          {new Date(conversation.startedAt).toISOString()}
        </div>
        <div>
          <span className="font-mono text-[var(--color-text-tertiary)]">sensitive unlocked: </span>
          {conversation.sensitiveUnlockedAt
            ? new Date(conversation.sensitiveUnlockedAt).toISOString()
            : "no"}
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-medium text-[var(--color-text-primary)]">
          Transcript
        </h2>
        {turns.length === 0 ? (
          <p className="text-[13px] text-[var(--color-text-tertiary)]">No turns.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--color-border)] p-3 text-[13px]"
              >
                <div
                  className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
                  style={{ letterSpacing: "0.18em" }}
                >
                  {t.role} · {t.at}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                  {t.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/admin/conversations/page.tsx "app/admin/conversations/[id]/page.tsx"
git commit -m "feat(admin): conversations list + transcript pages"
```

---

## Task 11: Askers page

`app/admin/askers/page.tsx` lists identified askers in a table with verified status.

**Files:**
- Create: `app/admin/askers/page.tsx`

- [ ] **Step 1: Write `app/admin/askers/page.tsx`**

```tsx
import { getDb } from "@/lib/db/client";
import { listAskers } from "@/lib/askers/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AskersPage() {
  const db = getDb();
  const askers = await listAskers(db);

  return (
    <>
      <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
        Askers
      </h1>
      {askers.length === 0 ? (
        <p className="text-[13px] text-[var(--color-text-tertiary)]">No askers yet.</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-tertiary)]">
              <th className="py-2 font-mono text-[10px] uppercase">Name</th>
              <th className="py-2 font-mono text-[10px] uppercase">Company</th>
              <th className="py-2 font-mono text-[10px] uppercase">Email</th>
              <th className="py-2 font-mono text-[10px] uppercase">Role</th>
              <th className="py-2 font-mono text-[10px] uppercase">Verified</th>
            </tr>
          </thead>
          <tbody>
            {askers.map((a) => (
              <tr key={a.id} className="border-b border-[var(--color-border)]">
                <td className="py-2 text-[var(--color-text-secondary)]">{a.name}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">{a.company}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">{a.workEmail}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">{a.role}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">
                  {a.verifiedAt
                    ? new Date(a.verifiedAt).toISOString().slice(0, 10)
                    : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/admin/askers/page.tsx
git commit -m "feat(admin): askers page"
```

---

## Task 12: Questions page

`app/admin/questions/page.tsx` lists forwarded questions, open vs. answered, split into two sections.

**Files:**
- Create: `app/admin/questions/page.tsx`

- [ ] **Step 1: Write `app/admin/questions/page.tsx`**

```tsx
import { getDb } from "@/lib/db/client";
import { listAllQuestions } from "@/lib/questions/repo";
import type { QuestionForAlex } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function QuestionList({ questions }: { questions: QuestionForAlex[] }) {
  if (questions.length === 0) {
    return <p className="text-[13px] text-[var(--color-text-tertiary)]">None.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--color-border)]">
      {questions.map((q) => (
        <li key={q.id} className="py-2 text-[13px]">
          <p className="text-[var(--color-text-secondary)]">{q.question}</p>
          <p
            className="mt-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
            style={{ letterSpacing: "0.18em" }}
          >
            {q.id.slice(0, 8)} · forwarded{" "}
            {new Date(q.createdAt).toISOString().slice(0, 10)}
            {q.answeredAt
              ? ` · answered ${new Date(q.answeredAt).toISOString().slice(0, 10)}`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function QuestionsPage() {
  const db = getDb();
  const all = await listAllQuestions(db);
  const open = all.filter((q) => q.answeredAt === null);
  const answered = all.filter((q) => q.answeredAt !== null);

  return (
    <>
      <h1 className="font-display text-[20px] font-medium text-[var(--color-text-primary)]">
        Forwarded questions
      </h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-medium text-[var(--color-text-primary)]">
          Open ({open.length})
        </h2>
        <QuestionList questions={open} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-medium text-[var(--color-text-primary)]">
          Answered ({answered.length})
        </h2>
        <QuestionList questions={answered} />
      </section>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/admin/questions/page.tsx
git commit -m "feat(admin): forwarded-questions page"
```

---

## Task 13: README documentation + final verification

Document the admin dashboard and the ops CLI in the README, then run the full verification suite.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Admin & ops" section to `README.md`**

Append the following section to `README.md` (place it after the existing setup/usage content; adjust the heading level to match the file):

```markdown
## Admin dashboard & ops CLI

### Web admin (`/admin`)

A read-only observability dashboard. Set `ADMIN_PASSWORD` and
`ADMIN_SESSION_SECRET` (generate the latter with `openssl rand -hex 32`) in
`.env.local` / Vercel env, then visit `/admin/login`. Pages:

- `/admin` — counts and recent activity.
- `/admin/conversations` — conversation list; `/admin/conversations/<id>` — full transcript.
- `/admin/askers` — identified people and verified status.
- `/admin/questions` — forwarded questions, open vs. answered.

The dashboard performs no writes. A signed, httpOnly session cookie (7-day TTL)
gates every `/admin/*` route.

### Ops CLI (`pnpm admin`)

All edits and deletes go through the CLI. It loads `.env.local` and connects
using `POSTGRES_URL` — possession of that connection string is the only
authorization.

```bash
pnpm admin conversations list            # list conversations
pnpm admin conversation show <id>        # print a full transcript
pnpm admin conversation delete <id>      # FK-safe delete
pnpm admin askers list                   # list identified askers
pnpm admin asker delete <id>             # FK-safe delete
pnpm admin questions list                 # list forwarded questions
pnpm admin question answer <id>          # mark a question answered
```
```

- [ ] **Step 2: Final verification — typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Final verification — tests**

```bash
pnpm test
```

Expected: all tests pass, including the new `auth.test.ts`, `commands.test.ts`, and `login/route.test.ts`.

- [ ] **Step 4: Final verification — build**

```bash
pnpm build
```

Expected: build succeeds; the route list shows `/admin`, `/admin/conversations`, `/admin/conversations/[id]`, `/admin/askers`, `/admin/questions`, `/admin/login`, `/api/admin/login`, `/api/admin/logout`, and `ƒ Middleware`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document admin dashboard + ops CLI"
```

---

## Self-review against the spec

- **Web admin pages** (spec §"Pages") → Tasks 9 (overview + shell), 10 (conversations list + detail), 11 (askers), 12 (questions). ✓
- **Authentication** (spec §"Authentication"): login form + `POST /api/admin/login` + cookie → Task 3; HMAC sign/verify → Task 2; middleware guard + Edge Web Crypto verification → Task 4; logout → Task 3. The Edge-vs-Node runtime split is explicit: `lib/admin/auth.ts` (`node:crypto`, route handlers) + `lib/admin/auth.edge.ts` (`crypto.subtle`, middleware). ✓
- **Ops CLI** (spec §"Ops CLI"): dependency-free dispatcher → Task 8; testable handlers in `lib/cli/` → Task 7; `.env.local` loading mirrors `scripts/migrate.ts` → Task 8. ✓
- **All seven CLI commands** (spec table) → Task 7 `runCommand`. ✓
- **FK-safe deletes** (spec §"Commands"): `conversation delete` removes referencing `questions_for_alex` rows first; `asker delete` removes referencing questions and nulls `conversations.askerId` first → Tasks 6 + 7. ✓
- **New repo functions** (spec §"New code"): `listConversations`, `getConversationById`, `deleteConversation`, `nullAskerOnConversations` in `lib/conversations/repo.ts`; new `lib/askers/repo.ts` with `listAskers`/`getAskerById`/`deleteAsker`; `listAllQuestions`/`getQuestionById`/`markQuestionAnswered`/`deleteQuestionsForConversation`/`deleteQuestionsForAsker` in `lib/questions/repo.ts` → Task 6. ✓
- **`.env.example`** gains `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` → Task 1. ✓
- **`package.json`** gains `"admin"` script → Task 8. ✓
- **Testing** (spec §"Testing"): `auth.ts` unit tests (fresh verifies, tampered/expired rejected) → Task 2; `commands.ts` unit tests (arg parsing + dispatch with injected db) → Task 7; DB repo functions implemented but not live-integration-tested per Plan 2 precedent → Task 6. ✓
- **Error handling** (spec §"Error handling"): CLI usage message + non-zero exit, "not found" + non-zero exit, confirmation + zero exit → Task 7; web wrong-password re-render → Task 3; missing/expired cookie redirect → Task 4. ✓
- **Final task**: README update + `pnpm typecheck && pnpm test && pnpm build` → Task 13. ✓
- **Out of scope** (email replies, auto-PR, digests, multi-user, KB editing) — none introduced. ✓

Type/signature names are consistent across tasks: `signSession`/`verifySession`/`SESSION_TTL_MS`/`SESSION_COOKIE_NAME` (Task 2) reused in Tasks 3–4; `verifySessionEdge` (Task 4); `runCommand`/`CliIo`/`CliRepos` (Task 7) reused in Task 8; the repo function names in Task 6 match exactly how Task 7's `DEFAULT_REPOS` and the page imports reference them. No placeholders remain.

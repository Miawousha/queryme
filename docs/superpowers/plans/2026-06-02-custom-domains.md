# Custom Domains (Vanity Hosting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account owner serve their queryme chat/resume page on their own subdomain (e.g. `cv.alex.com`) with the URL bar staying on that domain (vanity hosting), TLS issued automatically by Vercel.

**Architecture:** Approach A from the spec. A new `domains` table maps a hostname to an account. A `lib/domains/*` module owns Vercel Domains API calls, validation, status, an edge-safe Upstash cache, and a service seam. `middleware.ts` reads the `Host` header and, for a known custom domain, rewrites `/` → `/[slug]`, reusing the existing per-account routes untouched. A self-serve "Domains" tab in the per-account admin dashboard drives add / verify / remove via namespaced API routes.

**Tech Stack:** Next.js 15 (App Router, edge middleware), Drizzle ORM + Postgres, `@upstash/redis` (REST, edge-safe), Vercel Domains REST API, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-02-custom-domains-design.md`

---

## File Structure

**New files**
- `lib/domains/validate.ts` — pure hostname normalize + validate.
- `lib/domains/status.ts` — pure status computation from Vercel flags.
- `lib/domains/host.ts` — pure `isPlatformHost` + `resolveCustomHost` (used by middleware).
- `lib/domains/vercel.ts` — Vercel Domains API client + `VercelApiError`.
- `lib/domains/repo.ts` — Drizzle CRUD for the `domains` table.
- `lib/domains/edge-cache.ts` — edge-safe Upstash REST reader/writer for `domain:<host>`.
- `lib/domains/service.ts` — orchestration seam (add / refresh / remove / list).
- `app/api/a/[username]/admin/domains/route.ts` — `GET` list, `POST` add.
- `app/api/a/[username]/admin/domains/[id]/route.ts` — `DELETE` remove.
- `app/api/a/[username]/admin/domains/[id]/refresh/route.ts` — `POST` re-check.
- `components/admin/domains-panel.tsx` — the admin UI tab.
- Tests under `tests/lib/domains/*`, `tests/app/api/a/domains.test.ts`, `tests/components/admin/domains-panel.test.tsx`.

**Modified files**
- `lib/db/schema.ts` — add `domains` table + types.
- `lib/db/migrations/*` — generated migration.
- `middleware.ts` — host resolution + rewrite.
- `components/admin/admin-dashboard.tsx` — add the "domains" tab.
- `.env.example` — Vercel + `PLATFORM_HOST` vars.

---

### Task 1: `domains` table + migration

**Files:**
- Modify: `lib/db/schema.ts` (append after the `accounts` block)
- Create: `lib/db/migrations/00NN_*.sql` (generated)

- [ ] **Step 1: Add the table + types to the schema**

Append to `lib/db/schema.ts` (the file already imports `pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex` and `sql`):

```ts
/** One Vercel-issued verification challenge for a custom domain. */
export type DomainVerification = {
  type: string;
  domain: string;
  value: string;
  reason: string;
};

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    hostname: text("hostname").notNull(), // normalized lowercase; unique below
    status: text("status", { enum: ["pending", "active", "error"] })
      .notNull()
      .default("pending"),
    verification: jsonb("verification").$type<DomainVerification[]>(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (table) => ({
    hostnameUnique: uniqueIndex("domains_hostname_unique").on(table.hostname),
    accountIdx: index("domains_account_idx").on(table.accountId),
  }),
);

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit prints a new file path like `lib/db/migrations/0010_*.sql` containing `CREATE TABLE "domains"` plus the unique + account indexes. (Generation diffs against `lib/db/migrations/meta` and needs no DB connection.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(domains): add domains table + migration"
```

> Note: `pnpm db:migrate` (applies to the live DB, needs `POSTGRES_URL`) runs at deploy time, not here.

---

### Task 2: Hostname validation (pure)

**Files:**
- Create: `lib/domains/validate.ts`
- Test: `tests/lib/domains/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeHostname, validateHostname } from "@/lib/domains/validate";

describe("normalizeHostname", () => {
  it("lowercases and strips scheme, path, port, trailing dot", () => {
    expect(normalizeHostname("  HTTPS://CV.Alex.com:443/foo ")).toBe("cv.alex.com");
    expect(normalizeHostname("cv.alex.com.")).toBe("cv.alex.com");
  });
});

describe("validateHostname", () => {
  it("accepts a subdomain", () => {
    expect(validateHostname("cv.alex.com", "queryme.app")).toEqual({ ok: true });
  });
  it("rejects a bare apex (<3 labels)", () => {
    expect(validateHostname("alex.com", null).ok).toBe(false);
  });
  it("rejects an invalid hostname", () => {
    expect(validateHostname("not a host", null).ok).toBe(false);
  });
  it("rejects platform-owned names", () => {
    expect(validateHostname("evil.queryme.app", "queryme.app").ok).toBe(false);
    expect(validateHostname("queryme.app", "queryme.app").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/lib/domains/validate.test.ts`
Expected: FAIL — cannot find module `@/lib/domains/validate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domains/validate.ts

// RFC-1123 hostname: labels of a-z/0-9/hyphen, no leading/trailing hyphen,
// total length 1–253, TLD 2–63 alpha chars.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export type DomainValidation = { ok: true } | { ok: false; reason: string };

export function validateHostname(
  host: string,
  platformHost: string | null,
): DomainValidation {
  if (!HOSTNAME_RE.test(host)) {
    return { ok: false, reason: "Enter a valid domain like cv.yourname.com." };
  }
  // Subdomain-only (v1): require at least 3 labels. This treats ccTLD apexes
  // like `name.co.uk` as valid; that is an accepted v1 simplification (we don't
  // ship the Public Suffix List). Vercel still validates the domain itself.
  if (host.split(".").length < 3) {
    return {
      ok: false,
      reason: "Use a subdomain (e.g. cv.yourname.com); bare domains aren't supported yet.",
    };
  }
  if (platformHost && (host === platformHost || host.endsWith(`.${platformHost}`))) {
    return { ok: false, reason: "That domain is reserved by the platform." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/lib/domains/validate.test.ts`
Expected: PASS (4+ tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domains/validate.ts tests/lib/domains/validate.test.ts
git commit -m "feat(domains): hostname normalize + validate"
```

---

### Task 3: Status computation (pure)

**Files:**
- Create: `lib/domains/status.ts`
- Test: `tests/lib/domains/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeStatus } from "@/lib/domains/status";

describe("computeStatus", () => {
  it("is active only when verified and not misconfigured", () => {
    expect(computeStatus({ verified: true, misconfigured: false })).toBe("active");
  });
  it("is pending when unverified or misconfigured", () => {
    expect(computeStatus({ verified: false, misconfigured: false })).toBe("pending");
    expect(computeStatus({ verified: true, misconfigured: true })).toBe("pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/lib/domains/status.test.ts`
Expected: FAIL — cannot find module `@/lib/domains/status`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domains/status.ts
import type { Domain } from "@/lib/db/schema";

/**
 * Maps Vercel's verified/misconfigured flags to our stored status. `"error"`
 * is never returned here — the service assigns it when a Vercel API call throws.
 */
export function computeStatus(input: {
  verified: boolean;
  misconfigured: boolean;
}): Domain["status"] {
  return input.verified && !input.misconfigured ? "active" : "pending";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/lib/domains/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/status.ts tests/lib/domains/status.test.ts
git commit -m "feat(domains): status computation"
```

---

### Task 4: Host resolution helpers (pure)

**Files:**
- Create: `lib/domains/host.ts`
- Test: `tests/lib/domains/host.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { isPlatformHost, resolveCustomHost } from "@/lib/domains/host";

describe("isPlatformHost", () => {
  it("treats localhost, 127.*, *.vercel.app, and PLATFORM_HOST as platform", () => {
    expect(isPlatformHost("localhost", "queryme.app")).toBe(true);
    expect(isPlatformHost("127.0.0.1", "queryme.app")).toBe(true);
    expect(isPlatformHost("queryme-abc.vercel.app", "queryme.app")).toBe(true);
    expect(isPlatformHost("queryme.app", "queryme.app")).toBe(true);
    expect(isPlatformHost("www.queryme.app", "queryme.app")).toBe(true);
  });
  it("treats a custom domain as non-platform", () => {
    expect(isPlatformHost("cv.alex.com", "queryme.app")).toBe(false);
  });
});

describe("resolveCustomHost", () => {
  it("returns the slug from the lookup", async () => {
    expect(await resolveCustomHost("cv.alex.com", async () => "alex")).toBe("alex");
  });
  it("fails open to null when the lookup throws", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("kv down"));
    expect(await resolveCustomHost("cv.alex.com", lookup)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/lib/domains/host.test.ts`
Expected: FAIL — cannot find module `@/lib/domains/host`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domains/host.ts

/** Hosts the platform serves itself (never rewritten to a tenant). */
export function isPlatformHost(host: string, platformHost: string | null): boolean {
  if (host === "localhost" || host.startsWith("localhost:")) return true;
  if (host === "127.0.0.1" || host.startsWith("127.")) return true;
  if (host.endsWith(".vercel.app")) return true;
  if (platformHost && (host === platformHost || host.endsWith(`.${platformHost}`))) return true;
  return false;
}

/**
 * Resolve a custom host to an account slug via `lookup` (the KV reader).
 * Fails OPEN: any lookup error returns null so a KV/network blip falls back to
 * normal routing instead of 500-ing every request.
 */
export async function resolveCustomHost(
  host: string,
  lookup: (host: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    return await lookup(host);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/lib/domains/host.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/host.ts tests/lib/domains/host.test.ts
git commit -m "feat(domains): pure host-resolution helpers"
```

---

### Task 5: Vercel Domains API client

**Files:**
- Create: `lib/domains/vercel.ts`
- Test: `tests/lib/domains/vercel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  process.env.VERCEL_TOKEN = "tok";
  process.env.VERCEL_PROJECT_ID = "prj";
  delete process.env.VERCEL_TEAM_ID;
});
afterEach(() => vi.unstubAllGlobals());

describe("vercelDomains.add", () => {
  it("POSTs the host and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: "cv.alex.com", verified: false }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { vercelDomains } = await import("@/lib/domains/vercel");
    const out = await vercelDomains.add("cv.alex.com");
    expect(out.name).toBe("cv.alex.com");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vercel.com/v10/projects/prj/domains");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "cv.alex.com" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("throws VercelApiError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "domain_already_in_use", message: "taken" } }), {
          status: 409,
        }),
      ),
    );
    const { vercelDomains, VercelApiError } = await import("@/lib/domains/vercel");
    await expect(vercelDomains.add("cv.alex.com")).rejects.toBeInstanceOf(VercelApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/lib/domains/vercel.test.ts`
Expected: FAIL — cannot find module `@/lib/domains/vercel`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domains/vercel.ts
const API = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

export type ProjectDomain = {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};

export type DomainConfigResult = { misconfigured: boolean };

type Cfg = { token: string; projectId: string; teamId?: string };

function cfg(): Cfg {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw new Error("VERCEL_TOKEN and VERCEL_PROJECT_ID must be set to manage custom domains.");
  }
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

async function call<T>(path: string, init: RequestInit, c: Cfg): Promise<T> {
  const qs = c.teamId ? `?teamId=${c.teamId}` : "";
  const res = await fetch(`${API}${path}${qs}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new VercelApiError(
      body?.error?.code ?? `http_${res.status}`,
      body?.error?.message ?? `Vercel API error (${res.status})`,
    );
  }
  return body as T;
}

export type VercelClient = typeof vercelDomains;

export const vercelDomains = {
  add(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v10/projects/${c.projectId}/domains`, { method: "POST", body: JSON.stringify({ name: host }) }, c);
  },
  get(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v9/projects/${c.projectId}/domains/${host}`, { method: "GET" }, c);
  },
  config(host: string): Promise<DomainConfigResult> {
    const c = cfg();
    return call(`/v6/domains/${host}/config`, { method: "GET" }, c);
  },
  verify(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v9/projects/${c.projectId}/domains/${host}/verify`, { method: "POST" }, c);
  },
  async remove(host: string): Promise<void> {
    const c = cfg();
    await call(`/v9/projects/${c.projectId}/domains/${host}`, { method: "DELETE" }, c);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/lib/domains/vercel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/vercel.ts tests/lib/domains/vercel.test.ts
git commit -m "feat(domains): Vercel Domains API client"
```

---

### Task 6: Domains repo (Drizzle CRUD)

**Files:**
- Create: `lib/domains/repo.ts`

No dedicated unit test — these are thin Drizzle wrappers exercised through the service tests (Task 8), matching how `lib/admin/data.ts`'s DB calls are covered via their callers.

- [ ] **Step 1: Write the implementation**

```ts
// lib/domains/repo.ts
import { eq, sql } from "drizzle-orm";
import { domains, type Domain, type NewDomain } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function insertDomain(db: Db, values: NewDomain): Promise<Domain> {
  const [row] = await db.insert(domains).values(values).returning();
  return row;
}

export async function getDomainById(db: Db, id: string): Promise<Domain | null> {
  const [row] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  return row ?? null;
}

export async function getDomainByHostname(db: Db, hostname: string): Promise<Domain | null> {
  const [row] = await db.select().from(domains).where(eq(domains.hostname, hostname)).limit(1);
  return row ?? null;
}

export async function listDomainsByAccount(db: Db, accountId: string): Promise<Domain[]> {
  return db.select().from(domains).where(eq(domains.accountId, accountId)).orderBy(domains.createdAt);
}

export async function countDomainsByAccount(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(domains)
    .where(eq(domains.accountId, accountId));
  return row?.n ?? 0;
}

export async function updateDomain(
  db: Db,
  id: string,
  patch: Partial<NewDomain>,
): Promise<Domain | null> {
  const [row] = await db.update(domains).set(patch).where(eq(domains.id, id)).returning();
  return row ?? null;
}

export async function deleteDomain(db: Db, id: string): Promise<void> {
  await db.delete(domains).where(eq(domains.id, id));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/domains/repo.ts
git commit -m "feat(domains): domains repo"
```

---

### Task 7: Edge-safe Upstash cache

**Files:**
- Create: `lib/domains/edge-cache.ts`

A thin REST wrapper (like `lib/kv/client.ts`'s `UpstashKv`), constructed directly from `@upstash/redis` so it runs on the Edge runtime (the `getKv()` factory may lazy-`require("ioredis")`, which can't bundle on edge). Covered via service tests (Task 8), which mock this module.

- [ ] **Step 1: Write the implementation**

```ts
// lib/domains/edge-cache.ts
import { Redis } from "@upstash/redis";

const KEY_PREFIX = "domain:";

let cached: Redis | null = null;
function client(): Redis {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN required for the custom-domain cache.");
  }
  // automaticDeserialization:false keeps values as plain strings (see lib/kv/client.ts).
  cached = new Redis({ url, token, automaticDeserialization: false });
  return cached;
}

export async function getDomainSlug(host: string): Promise<string | null> {
  return (await client().get<string>(`${KEY_PREFIX}${host}`)) ?? null;
}

export async function setDomainSlug(host: string, slug: string): Promise<void> {
  await client().set(`${KEY_PREFIX}${host}`, slug);
}

export async function delDomainSlug(host: string): Promise<void> {
  await client().del(`${KEY_PREFIX}${host}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/domains/edge-cache.ts
git commit -m "feat(domains): edge-safe Upstash host cache"
```

---

### Task 8: Domains service (orchestration seam)

**Files:**
- Create: `lib/domains/service.ts`
- Test: `tests/lib/domains/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/domains/repo");
vi.mock("@/lib/domains/vercel");
vi.mock("@/lib/domains/edge-cache");

import * as repo from "@/lib/domains/repo";
import { vercelDomains, VercelApiError } from "@/lib/domains/vercel";
import { setDomainSlug, delDomainSlug } from "@/lib/domains/edge-cache";
import {
  addDomainForAccount,
  refreshStatus,
  removeDomainForAccount,
  DomainError,
  MAX_DOMAINS_PER_ACCOUNT,
} from "@/lib/domains/service";

const db = {} as any;
const account = { id: "acct-a", username: "alex" } as any;
const baseRow = {
  id: "d1",
  accountId: "acct-a",
  hostname: "cv.alex.com",
  status: "pending",
  verification: null,
  lastError: null,
  createdAt: new Date(),
  verifiedAt: null,
  lastCheckedAt: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_HOST = "queryme.app";
});

describe("addDomainForAccount", () => {
  it("rejects an invalid hostname before touching Vercel", async () => {
    await expect(addDomainForAccount(db, account, "alex.com")).rejects.toBeInstanceOf(DomainError);
    expect(vercelDomains.add).not.toHaveBeenCalled();
  });

  it("rejects when the per-account limit is reached", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(MAX_DOMAINS_PER_ACCOUNT);
    await expect(addDomainForAccount(db, account, "cv.alex.com")).rejects.toMatchObject({ reason: "limit" });
  });

  it("rejects a hostname already taken", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(0);
    vi.mocked(repo.getDomainByHostname).mockResolvedValue(baseRow);
    await expect(addDomainForAccount(db, account, "cv.alex.com")).rejects.toMatchObject({ reason: "taken" });
  });

  it("attaches to Vercel and inserts a pending row", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(0);
    vi.mocked(repo.getDomainByHostname).mockResolvedValue(null);
    vi.mocked(vercelDomains.add).mockResolvedValue({ name: "cv.alex.com", verified: false });
    vi.mocked(repo.insertDomain).mockResolvedValue(baseRow);
    const out = await addDomainForAccount(db, account, " CV.alex.com ");
    expect(vercelDomains.add).toHaveBeenCalledWith("cv.alex.com");
    expect(out.instructions).toEqual({ type: "CNAME", name: "cv", value: "cname.vercel-dns.com" });
  });
});

describe("refreshStatus", () => {
  it("activates and writes the KV slug when verified + configured", async () => {
    vi.mocked(vercelDomains.get).mockResolvedValue({ name: "cv.alex.com", verified: true });
    vi.mocked(vercelDomains.config).mockResolvedValue({ misconfigured: false });
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "active" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("active");
    expect(setDomainSlug).toHaveBeenCalledWith("cv.alex.com", "alex");
  });

  it("stays pending and clears the KV slug when not yet configured", async () => {
    vi.mocked(vercelDomains.get).mockResolvedValue({ name: "cv.alex.com", verified: false });
    vi.mocked(vercelDomains.config).mockResolvedValue({ misconfigured: true });
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "pending" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("pending");
    expect(delDomainSlug).toHaveBeenCalledWith("cv.alex.com");
  });

  it("marks error when Vercel throws", async () => {
    vi.mocked(vercelDomains.get).mockRejectedValue(new VercelApiError("boom", "nope"));
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "error", lastError: "nope" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("error");
  });
});

describe("removeDomainForAccount", () => {
  it("rejects a domain owned by another account", async () => {
    vi.mocked(repo.getDomainById).mockResolvedValue({ ...baseRow, accountId: "acct-b" });
    await expect(removeDomainForAccount(db, account, "d1")).rejects.toBeInstanceOf(DomainError);
    expect(repo.deleteDomain).not.toHaveBeenCalled();
  });

  it("removes from Vercel, DB, and KV", async () => {
    vi.mocked(repo.getDomainById).mockResolvedValue(baseRow);
    await removeDomainForAccount(db, account, "d1");
    expect(vercelDomains.remove).toHaveBeenCalledWith("cv.alex.com");
    expect(repo.deleteDomain).toHaveBeenCalledWith(db, "d1");
    expect(delDomainSlug).toHaveBeenCalledWith("cv.alex.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/lib/domains/service.test.ts`
Expected: FAIL — cannot find module `@/lib/domains/service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domains/service.ts
import type { getDb } from "@/lib/db/client";
import type { Account, Domain } from "@/lib/db/schema";
import { normalizeHostname, validateHostname } from "@/lib/domains/validate";
import { computeStatus } from "@/lib/domains/status";
import { vercelDomains, VercelApiError } from "@/lib/domains/vercel";
import * as repo from "@/lib/domains/repo";
import { setDomainSlug, delDomainSlug } from "@/lib/domains/edge-cache";

type Db = ReturnType<typeof getDb>;

export const MAX_DOMAINS_PER_ACCOUNT = 3;
const CNAME_TARGET = "cname.vercel-dns.com";

/** `reason` is a machine code; `message` is human-facing. */
export class DomainError extends Error {
  constructor(
    public reason: "invalid" | "limit" | "taken" | "not-found",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type DomainInstructions = { type: "CNAME"; name: string; value: string };
export type DomainView = Domain & { instructions: DomainInstructions };

/** The CNAME record the user must create: name = the sub-label(s), value = target. */
function instructionsFor(hostname: string): DomainInstructions {
  const name = hostname.split(".").slice(0, -2).join(".") || hostname;
  return { type: "CNAME", name, value: CNAME_TARGET };
}

export function toView(d: Domain): DomainView {
  return { ...d, instructions: instructionsFor(d.hostname) };
}

export async function addDomainForAccount(
  db: Db,
  account: Account,
  raw: string,
): Promise<DomainView> {
  const hostname = normalizeHostname(raw);
  const check = validateHostname(hostname, process.env.PLATFORM_HOST ?? null);
  if (!check.ok) throw new DomainError("invalid", check.reason);

  if ((await repo.countDomainsByAccount(db, account.id)) >= MAX_DOMAINS_PER_ACCOUNT) {
    throw new DomainError("limit", `You can add up to ${MAX_DOMAINS_PER_ACCOUNT} domains.`);
  }
  if (await repo.getDomainByHostname(db, hostname)) {
    throw new DomainError("taken", "That domain is already in use.");
  }

  let verification: Domain["verification"] = null;
  try {
    const added = await vercelDomains.add(hostname);
    verification = added.verification ?? null;
  } catch (e) {
    if (e instanceof VercelApiError && e.code === "domain_already_in_use") {
      throw new DomainError("taken", "That domain is already in use.");
    }
    throw e;
  }

  const row = await repo.insertDomain(db, {
    accountId: account.id,
    hostname,
    status: "pending",
    verification,
  });
  return toView(row);
}

export async function refreshStatus(db: Db, domain: Domain, slug: string): Promise<DomainView> {
  try {
    const [pd, conf] = await Promise.all([
      vercelDomains.get(domain.hostname),
      vercelDomains.config(domain.hostname),
    ]);
    const status = computeStatus({ verified: pd.verified, misconfigured: conf.misconfigured });
    const updated =
      (await repo.updateDomain(db, domain.id, {
        status,
        verification: pd.verification ?? null,
        lastError: null,
        lastCheckedAt: new Date(),
        verifiedAt: status === "active" ? (domain.verifiedAt ?? new Date()) : null,
      })) ?? domain;

    if (status === "active") await setDomainSlug(domain.hostname, slug);
    else await delDomainSlug(domain.hostname);

    return toView(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const updated =
      (await repo.updateDomain(db, domain.id, {
        status: "error",
        lastError: message,
        lastCheckedAt: new Date(),
      })) ?? domain;
    return toView(updated);
  }
}

export async function removeDomainForAccount(
  db: Db,
  account: Account,
  domainId: string,
): Promise<void> {
  const row = await repo.getDomainById(db, domainId);
  if (!row || row.accountId !== account.id) {
    throw new DomainError("not-found", "Domain not found.");
  }
  try {
    await vercelDomains.remove(row.hostname);
  } catch (e) {
    // Tolerate "already removed on Vercel" — still clean up our side.
    if (!(e instanceof VercelApiError)) throw e;
  }
  await repo.deleteDomain(db, row.id);
  await delDomainSlug(row.hostname);
}

export async function listDomainsForAccount(db: Db, accountId: string): Promise<DomainView[]> {
  const rows = await repo.listDomainsByAccount(db, accountId);
  return rows.map(toView);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/lib/domains/service.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/domains/service.ts tests/lib/domains/service.test.ts
git commit -m "feat(domains): orchestration service (add/refresh/remove/list)"
```

---

### Task 9: Middleware host resolution + rewrite

**Files:**
- Modify: `middleware.ts`

Pure logic is already covered by Task 4; middleware itself is verified manually (Step 4). The existing CSP behavior must be preserved on both the rewrite and pass-through branches.

- [ ] **Step 1: Add imports**

At the top of `middleware.ts`, after the existing `next/server` import:

```ts
import { isPlatformHost, resolveCustomHost } from "@/lib/domains/host";
import { getDomainSlug } from "@/lib/domains/edge-cache";
```

- [ ] **Step 2: Make the handler async and add the rewrite branch**

Change the signature to `export async function middleware(request: NextRequest) {`. Keep the existing `nonce`/`csp`/`requestHeaders` block exactly as-is. Replace the final response block:

```ts
  // existing nonce + csp + requestHeaders construction stays above this line …

  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const platformHost = process.env.PLATFORM_HOST ?? null;

  // Custom-domain vanity hosting: a non-platform host hitting the root renders
  // that account's page in place. Only "/" is rewritten — the namespaced
  // /api/a/{slug}/* calls are excluded from middleware and resolve by path.
  if (request.nextUrl.pathname === "/" && !isPlatformHost(host, platformHost)) {
    const slug = await resolveCustomHost(host, getDomainSlug);
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/${slug}`;
      const rewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      rewrite.headers.set("content-security-policy", csp);
      return rewrite;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `pnpm test` (full suite) — Expected: all pass (no regression).
Local dev note: `localhost` is a platform host, so dev never hits KV. Custom-domain rewrite is verified in a Vercel preview/prod where `Host` is a real custom domain (see Task 13).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(domains): middleware rewrites custom hosts to /[slug]"
```

---

### Task 10: Domains collection API (`GET` list, `POST` add)

**Files:**
- Create: `app/api/a/[username]/admin/domains/route.ts`
- Test: `tests/app/api/a/domains.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const resolveAccountAdmin = vi.fn();
const addDomainForAccount = vi.fn();
const listDomainsForAccount = vi.fn();
const removeDomainForAccount = vi.fn();

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/domains/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domains/service")>("@/lib/domains/service");
  return { ...actual, addDomainForAccount, listDomainsForAccount, removeDomainForAccount };
});

const ctx = (username: string) => ({ params: Promise.resolve({ username }) });
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/a/[username]/admin/domains", () => {
  it("404s when caller can't administer the account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { GET } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await GET(new NextRequest("http://x"), ctx("alex"));
    expect(res.status).toBe(404);
  });

  it("returns the account's domains when authorized", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    listDomainsForAccount.mockResolvedValue([{ id: "d1", hostname: "cv.alex.com" }]);
    const { GET } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await GET(new NextRequest("http://x"), ctx("alex"));
    expect(res.status).toBe(200);
    expect((await res.json()).domains).toHaveLength(1);
  });
});

describe("POST /api/a/[username]/admin/domains", () => {
  it("400s a DomainError with its message", async () => {
    const { DomainError } = await import("@/lib/domains/service");
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    addDomainForAccount.mockRejectedValue(new DomainError("invalid", "bad host"));
    const { POST } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await POST(postReq({ hostname: "x" }), ctx("alex"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad host");
  });

  it("201s with the created domain", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    addDomainForAccount.mockResolvedValue({ id: "d1", hostname: "cv.alex.com" });
    const { POST } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await POST(postReq({ hostname: "cv.alex.com" }), ctx("alex"));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/app/api/a/domains.test.ts`
Expected: FAIL — cannot find route module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/a/[username]/admin/domains/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { addDomainForAccount, listDomainsForAccount, DomainError } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ domains: await listDomainsForAccount(getDb(), res.account.id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { hostname?: unknown };
  if (typeof body.hostname !== "string") {
    return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  }
  try {
    const domain = await addDomainForAccount(getDb(), res.account, body.hostname);
    return NextResponse.json({ domain }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message, reason: e.reason }, { status: 400 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/app/api/a/domains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/a/[username]/admin/domains/route.ts" tests/app/api/a/domains.test.ts
git commit -m "feat(domains): list + add API route"
```

---

### Task 11: Domain item API (`DELETE`, `POST refresh`)

**Files:**
- Create: `app/api/a/[username]/admin/domains/[id]/route.ts`
- Create: `app/api/a/[username]/admin/domains/[id]/refresh/route.ts`
- Test: append to `tests/app/api/a/domains.test.ts`

- [ ] **Step 1: Append the failing tests**

Add `getDomainById` and `refreshStatus` to the mocked service in the existing `vi.mock("@/lib/domains/service", ...)` factory — extend it to also mock `refreshStatus` — and mock the repo:

```ts
// add near the other vi.mock calls at the top of tests/app/api/a/domains.test.ts
const getDomainById = vi.fn();
const refreshStatus = vi.fn();
vi.mock("@/lib/domains/repo", () => ({ getDomainById }));
// extend the service mock factory's return object with: refreshStatus
```

Then append:

```ts
const idCtx = (username: string, id: string) => ({ params: Promise.resolve({ username, id }) });

describe("DELETE /api/a/[username]/admin/domains/[id]", () => {
  it("404s when caller can't administer the account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { DELETE } = await import("@/app/api/a/[username]/admin/domains/[id]/route");
    const res = await DELETE(new NextRequest("http://x", { method: "DELETE" }), idCtx("alex", "d1"));
    expect(res.status).toBe(404);
  });

  it("removes and returns ok when authorized", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    removeDomainForAccount.mockResolvedValue(undefined);
    const { DELETE } = await import("@/app/api/a/[username]/admin/domains/[id]/route");
    const res = await DELETE(new NextRequest("http://x", { method: "DELETE" }), idCtx("alex", "d1"));
    expect(res.status).toBe(200);
    expect(removeDomainForAccount).toHaveBeenCalled();
  });
});

describe("POST /api/a/[username]/admin/domains/[id]/refresh", () => {
  it("404s when the domain belongs to another account (IDOR guard)", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    getDomainById.mockResolvedValue({ id: "d1", accountId: "other" });
    const { POST } = await import("@/app/api/a/[username]/admin/domains/[id]/refresh/route");
    const res = await POST(new NextRequest("http://x", { method: "POST" }), idCtx("alex", "d1"));
    expect(res.status).toBe(404);
    expect(refreshStatus).not.toHaveBeenCalled();
  });

  it("refreshes when authorized and owned", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    getDomainById.mockResolvedValue({ id: "d1", accountId: "a", hostname: "cv.alex.com" });
    refreshStatus.mockResolvedValue({ id: "d1", status: "active" });
    const { POST } = await import("@/app/api/a/[username]/admin/domains/[id]/refresh/route");
    const res = await POST(new NextRequest("http://x", { method: "POST" }), idCtx("alex", "d1"));
    expect(res.status).toBe(200);
    expect(refreshStatus).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/app/api/a/domains.test.ts`
Expected: FAIL — cannot find the `[id]` route modules.

- [ ] **Step 3: Write the two route modules**

```ts
// app/api/a/[username]/admin/domains/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { removeDomainForAccount, DomainError } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await removeDomainForAccount(getDb(), res.account, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
```

```ts
// app/api/a/[username]/admin/domains/[id]/refresh/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getDomainById } from "@/lib/domains/repo";
import { refreshStatus } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const row = await getDomainById(db, id);
  if (!row || row.accountId !== res.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const domain = await refreshStatus(db, row, res.account.username);
  return NextResponse.json({ domain });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/app/api/a/domains.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add "app/api/a/[username]/admin/domains/[id]" tests/app/api/a/domains.test.ts
git commit -m "feat(domains): delete + refresh API routes with ownership guard"
```

---

### Task 12: Domains panel UI + dashboard tab

**Files:**
- Create: `components/admin/domains-panel.tsx`
- Modify: `components/admin/admin-dashboard.tsx`
- Test: `tests/components/admin/domains-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DomainsPanel } from "@/components/admin/domains-panel";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domains: [
            {
              id: "d1",
              hostname: "cv.alex.com",
              status: "pending",
              instructions: { type: "CNAME", name: "cv", value: "cname.vercel-dns.com" },
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("DomainsPanel", () => {
  it("lists domains fetched from the API with their status and DNS target", async () => {
    render(<DomainsPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText("cv.alex.com")).toBeInTheDocument());
    expect(screen.getByText(/cname\.vercel-dns\.com/)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/admin/domains-panel.test.tsx`
Expected: FAIL — cannot find module `@/components/admin/domains-panel`.

- [ ] **Step 3: Write the component**

```tsx
// components/admin/domains-panel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

type Instructions = { type: string; name: string; value: string };
type DomainView = {
  id: string;
  hostname: string;
  status: "pending" | "active" | "error";
  lastError?: string | null;
  instructions: Instructions;
};

const STATUS_STYLE: Record<DomainView["status"], string> = {
  active: "border-[var(--color-primary)] text-[var(--color-primary)]",
  pending: "border-[var(--color-accent)] text-[var(--color-accent)]",
  error: "border-red-400 text-red-400",
};

export function DomainsPanel({ apiBasePath }: { apiBasePath: string }) {
  const [domains, setDomains] = useState<DomainView[]>([]);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${apiBasePath}/domains`);
    if (!r.ok) {
      setError(`HTTP ${r.status}`);
      return;
    }
    setDomains((await r.json()).domains ?? []);
  }, [apiBasePath]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  // Auto-poll only while something is still pending.
  useEffect(() => {
    if (!domains.some((d) => d.status === "pending")) return;
    const t = setInterval(() => {
      load().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [domains, load]);

  async function add() {
    if (!hostname.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBasePath}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? `HTTP ${r.status}`);
      else {
        setHostname("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    await fetch(`${apiBasePath}/domains/${id}/refresh`, { method: "POST" }).catch(() => {});
    await load();
  }

  async function remove(id: string) {
    await fetch(`${apiBasePath}/domains/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Add a custom domain (subdomain, e.g. cv.yourname.com)</span>
        <div className="flex items-center gap-2">
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="cv.yourname.com"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-[13px]"
          />
          <button
            type="button"
            disabled={busy || !hostname.trim()}
            onClick={add}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase",
              "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ letterSpacing: "0.18em" }}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div className="flex flex-col gap-3">
        {domains.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)]">No custom domains yet.</p>
        )}
        {domains.map((d) => (
          <div
            key={d.id}
            className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[var(--color-text-primary)]">{d.hostname}</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase",
                  STATUS_STYLE[d.status],
                )}
                style={{ letterSpacing: "0.16em" }}
              >
                {d.status}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => verify(d.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] uppercase hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  style={{ letterSpacing: "0.18em" }}
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] uppercase hover:border-red-400 hover:text-red-400"
                  style={{ letterSpacing: "0.18em" }}
                >
                  Remove
                </button>
              </span>
            </div>
            {d.status !== "active" && (
              <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                Set a {d.instructions.type} record: {d.instructions.name} →{" "}
                <span className="text-[var(--color-text-secondary)]">{d.instructions.value}</span>
              </p>
            )}
            {d.status === "error" && d.lastError && (
              <p className="text-xs text-red-400">{d.lastError}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the tab into `admin-dashboard.tsx`**

Make these edits in `components/admin/admin-dashboard.tsx`:

1. Add the import near the other component imports:
```ts
import { DomainsPanel } from "@/components/admin/domains-panel";
```
2. Extend the `TabId` union to include `"domains"`:
```ts
type TabId = "interviewers" | "conversations" | "questions" | "content" | "analytics" | "domains";
```
3. Add `domains: null` to the `selected` initial state object.
4. Add a tab entry to the `tabs` array (after `analytics`):
```ts
{ id: "domains", label: "Domains", count: 0 },
```
5. Render the panel alongside the other tab panels:
```tsx
{tab === "domains" && <DomainsPanel apiBasePath={apiBasePath} />}
```
6. Exclude `"domains"` from the detail sidebar (it has no row detail), matching `content`/`analytics`. Change the `DetailSidebar` `open` prop:
```tsx
open={tab !== "content" && tab !== "analytics" && tab !== "domains" && selectedId !== null}
```
7. In `TabMeta`, return `null` for the domains tab — update the existing guard:
```ts
if (tab === "analytics" || tab === "content" || tab === "domains") return null;
```

- [ ] **Step 5: Run test + typecheck to verify**

Run: `pnpm test -- tests/components/admin/domains-panel.test.tsx`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/domains-panel.tsx components/admin/admin-dashboard.tsx tests/components/admin/domains-panel.test.tsx
git commit -m "feat(domains): self-serve domains tab in the admin dashboard"
```

---

### Task 13: Env docs + full verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the config section to `.env.example`**

Append:

```bash
# Custom domains (vanity hosting) — Vercel-primary
# Token + project that own the deployment; used to attach/verify user domains.
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
# Only for team-scoped projects:
VERCEL_TEAM_ID=
# The platform's own host — requests to it (and *.PLATFORM_HOST, *.vercel.app,
# localhost) are served normally; everything else is treated as a custom domain.
PLATFORM_HOST=queryme.app
```

- [ ] **Step 2: Run the full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests pass (existing 323 + the new domain/route/component tests).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(domains): document Vercel + PLATFORM_HOST env vars"
```

- [ ] **Step 4: Post-merge / deploy checklist (manual, not a code step)**

1. Apply the migration to prod: `pnpm db:migrate` (needs `POSTGRES_URL`).
2. Set `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, (`VERCEL_TEAM_ID`), `PLATFORM_HOST` in the Vercel project env.
3. Smoke test on a preview/prod URL: as an account owner, open the admin **Domains** tab, add a real subdomain you control, set the CNAME, click **Verify**, confirm it flips to `active`, then load the subdomain and confirm the persona page renders in place with chat working.

---

## Self-Review

**Spec coverage:**
- Vanity hosting / rewrite — Task 9 (middleware) + Task 4 (pure helpers). ✓
- Vercel-issued TLS via Domains API — Task 5 (client) + Task 8 (service). ✓
- Self-serve UI — Task 12. ✓
- Subdomain-only — Task 2 (`validateHostname` < 3 labels). ✓
- `domains` table (unique hostname, indexes) — Task 1. ✓
- Host→account via KV map — Task 7 (cache) + Task 8 (write on activate / delete on remove) + Task 9 (read). ✓
- Guardrails (limit, uniqueness, platform-owned, public-only) — Task 2 + Task 8 + Task 9 (only `/` rewritten). ✓
- Error handling (400 validation, error status on Vercel failure, fail-open middleware) — Tasks 8, 10, 4. ✓
- Testing matrix (validate, status, host, service, vercel, API guard) — Tasks 2–5, 8, 10–12. ✓
- Config/env — Task 13. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete, runnable code.

**Type consistency:** `Domain`/`NewDomain`/`DomainVerification` (Task 1) used consistently; `vercelDomains`/`VercelApiError`/`ProjectDomain`/`DomainConfigResult` (Task 5) match service usage (Task 8); `refreshStatus(db, domain, slug)` signature matches its caller in the refresh route (Task 11); `DomainView`/`DomainInstructions` shape (Task 8) matches what `DomainsPanel` consumes (Task 12); `DomainError.reason` codes (`invalid|limit|taken|not-found`) match the service tests and route handling.

**Note on `error` status:** `computeStatus` returns only `active|pending`; `error` is assigned solely by `refreshStatus`'s catch block — intentional and consistent across Tasks 3 and 8.

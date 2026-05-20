# Queryme — Plan 2: Identification + Sensitive Content + Lead Capture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered access to the queryable CV — public content remains open, but salary expectations, references, and private contact are gated behind verified email identification. Capture identified askers and forwarded questions for follow-up.

**Architecture:** Postgres (Drizzle ORM + Neon) for asker / conversation / forwarded-question persistence. Upstash Redis (Vercel KV) for rate limits, verification codes, and bearer tokens. Resend for transactional verification emails. The agent emits inline `[[identify]]` and `[[forward:...]]` markers in its responses; the chat renderer rewrites those markers into buttons that open a two-step identification modal or send a question into the queue. Sensitive KB content is appended to the system prompt only when the conversation is verified, and is placed AFTER the cached prefix (the public KB stays cached forever; sensitive is small and per-conversation).

**Tech Stack:** Drizzle ORM, `@neondatabase/serverless`, `drizzle-kit`, `@upstash/redis`, `resend`, `@react-email/components`, plus everything already from Plan 1.

**Starts from:** main branch at commit `35afedb` (Plan 1 shipped). End state: all of Plan 2 merged and deployed.

**Out of scope for this plan (deferred to Plans 3-4):**
- MCP server (Plan 3) — but the public functions this plan exports (`requestIdentification`, `verifyIdentification`, `answer` with sensitive, `forwardQuestion`) are shaped so Plan 3's MCP tools can wrap them directly.
- Admin panel (Plan 4) — but the Postgres tables this plan creates are the same ones the admin will read.
- Promote-question-to-KB auto-PR generation (deferred per spec).
- Weekly digest emails (deferred per spec).
- Cache-breakpoint on sensitive chunk (deferred — sensitive is small, low-frequency).
- DB integration tests against a live Postgres (deferred — schema parity with prod via Drizzle, integration testing manual via smoke).

---

## File structure produced by this plan

```
queryme/
├── drizzle.config.ts                  # Task 2
├── .env.example                       # Modified Task 1 (env vars)
├── README.md                          # Modified Task 24
│
├── kb/
│   └── sensitive/                     # Task 22 — placeholder content for Alexandre
│       ├── salary.yaml
│       ├── references.yaml
│       └── private-contact.yaml
│
├── prompts/
│   └── system.md                      # Modified Task 14 — add identification + forwarding rules
│
├── lib/
│   ├── db/
│   │   ├── client.ts                  # Task 2 — Drizzle client (Neon HTTP driver)
│   │   ├── schema.ts                  # Task 3 — askers, conversations, questions_for_alex
│   │   └── migrations/                # Task 3 — Drizzle-generated SQL migrations
│   │       └── 0000_initial.sql
│   │
│   ├── kv/
│   │   ├── client.ts                  # Task 4 — @upstash/redis singleton
│   │   └── rate-limit.ts              # Task 5 — fixed-window rate limit helper
│   │
│   ├── identity/
│   │   ├── email-domain.ts            # Task 6 — reject free-email domains
│   │   ├── codes.ts                   # Task 7 — generate / store / verify 6-digit codes
│   │   ├── tokens.ts                  # Task 8 — bearer token issuance (KV-backed, 24h TTL)
│   │   ├── resend.ts                  # Task 9 — send-verification-code via Resend
│   │   └── service.ts                 # Task 10 — orchestrates request / verify
│   │
│   ├── conversations/
│   │   └── repo.ts                    # Task 11 — getOrCreate / appendTurn / markUnlocked / isUnlocked
│   │
│   ├── questions/
│   │   └── repo.ts                    # Task 12 — forwardQuestion / listOpen (Plan 4 will list)
│   │
│   ├── kb/
│   │   ├── schemas.ts                 # Modified Task 13 — add Salary/References/PrivateContact schemas
│   │   ├── loader.ts                  # Modified Task 13 — also load sensitive/ if present
│   │   ├── assembler.ts               # Modified Task 13 — split assemblePublicKbText / assembleSensitiveKbText
│   │   └── citations.ts               # unchanged
│   │
│   ├── prompts.ts                     # Modified Task 14 — buildSystemPromptParts accepts sensitive
│   └── answerer.ts                    # Modified Task 15 — accept sensitiveKbText, append AFTER cache
│
├── emails/
│   └── verification-code.tsx          # Task 9 — React Email template
│
├── app/
│   └── api/
│       ├── chat/route.ts              # Modified Task 16 — accept conversationId, log, include sensitive if unlocked
│       ├── identify/
│       │   ├── request/route.ts       # Task 17 — POST → send code
│       │   └── verify/route.ts        # Task 18 — POST → unlock conversation
│       └── forward-question/route.ts  # Task 19 — POST → enqueue
│
├── components/
│   ├── chat.tsx                       # Modified Task 20 — conversationId via localStorage, modal state, callbacks
│   ├── chat-message.tsx               # Modified Task 21 — detect [[identify]] / [[forward:...]] markers, render buttons
│   └── identify-modal.tsx             # Task 20 — two-step modal (form → code)
│
├── scripts/
│   └── migrate.ts                     # Task 3 — runs Drizzle migrations against POSTGRES_URL
│
└── tests/
    ├── lib/
    │   ├── kv/
    │   │   └── rate-limit.test.ts     # Task 5
    │   ├── identity/
    │   │   ├── email-domain.test.ts   # Task 6
    │   │   ├── codes.test.ts          # Task 7
    │   │   └── tokens.test.ts         # Task 8
    │   ├── kb/
    │   │   ├── schemas.test.ts        # Extended Task 13
    │   │   ├── loader.test.ts         # Extended Task 13
    │   │   └── assembler.test.ts      # Extended Task 13
    │   ├── prompts.test.ts            # Extended Task 14
    │   └── answerer.test.ts           # Extended Task 15
    ├── app/api/
    │   ├── chat/route.test.ts         # Extended Task 16 (already has validation tests)
    │   ├── identify/
    │   │   ├── request/route.test.ts  # Task 17
    │   │   └── verify/route.test.ts   # Task 18
    │   └── forward-question/route.test.ts  # Task 19
    └── fixtures/kb/sensitive/         # Task 13 — minimal fixture sensitive content
        ├── salary.yaml
        ├── references.yaml
        └── private-contact.yaml
```

**Conventions:**
- TDD strictly: failing test → implementation → passing test. Don't skip the failing-test step.
- Commit after each task with the message in Step N.
- All paths relative to `/Users/alexandrecollet/queryme`.
- Run from repo root. `pnpm` is the package manager.
- KV / DB stubs: tests use a thin in-memory implementation (defined alongside the production client and selected by env). No real Postgres or Redis needed for CI.

---

## Task 1: Install Plan 2 dependencies and add env stubs

No tests; this is dependency setup. The plan's success criterion is `pnpm typecheck` + `pnpm test` (the 42 Plan 1 tests) still pass.

**Files:**
- Modify: `package.json` (deps)
- Modify: `.env.example`

- [ ] **Step 1: Install runtime + dev deps**

```bash
pnpm add drizzle-orm @neondatabase/serverless @upstash/redis resend @react-email/components @react-email/render
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Extend `.env.example`**

Open `.env.example`. Append below the existing entries:
```bash

# --- Plan 2: persistence + identification ---

# Postgres connection string (Vercel Postgres / Neon)
# Get via: `vercel env pull` after linking, or from the Neon console
POSTGRES_URL=

# Upstash Redis (Vercel KV) — both required
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Resend transactional email
RESEND_API_KEY=
RESEND_FROM_EMAIL=verify@yourdomain.com

# Optional: short app name used in the verification email subject + body
APP_NAME=Queryme
APP_PUBLIC_URL=https://queryme-three.vercel.app
```

- [ ] **Step 3: Verify nothing is broken**

```bash
pnpm typecheck
pnpm test
```

Expected: typecheck clean, 42/42 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore: add Plan 2 dependencies + env stubs"
```

---

## Task 2: Drizzle config + client

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`

This task sets up the type-safe client. The schema itself comes in Task 3 — until then, the client exports `db` but with no tables.

- [ ] **Step 1: Write `drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "",
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Write `lib/db/client.ts`**

```typescript
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

export function makeDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle({ client: sql });
}

let cached: ReturnType<typeof makeDb> | null = null;

export function getDb() {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "POSTGRES_URL is not set. Configure it in .env.local (local) or Vercel env (production).",
    );
  }
  cached = makeDb(url);
  return cached;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean. (The client compiles; nothing imports it yet.)

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts
git commit -m "feat(db): add Drizzle client (Neon HTTP driver)"
```

---

## Task 3: Drizzle schema + initial migration + migrate script

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/migrations/0000_initial.sql` (generated by drizzle-kit)
- Create: `scripts/migrate.ts`
- Modify: `package.json` (add `db:generate` and `db:migrate` scripts)

- [ ] **Step 1: Write `lib/db/schema.ts`**

```typescript
import { pgTable, uuid, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const askers = pgTable("askers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  company: text("company").notNull(),
  workEmail: text("work_email").notNull().unique(),
  role: text("role").notNull(),
  purpose: text("purpose"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  askerId: uuid("asker_id").references(() => askers.id),
  channel: text("channel", { enum: ["chat", "mcp"] }).notNull(),
  language: text("language", { enum: ["en", "fr"] }),
  transcript: jsonb("transcript").$type<ConversationTurn[]>().notNull().default(sql`'[]'::jsonb`),
  sensitiveUnlockedAt: timestamp("sensitive_unlocked_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionsForAlex = pgTable("questions_for_alex", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  askerId: uuid("asker_id").references(() => askers.id),
  question: text("question").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO timestamp
};

export type Asker = typeof askers.$inferSelect;
export type NewAsker = typeof askers.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type QuestionForAlex = typeof questionsForAlex.$inferSelect;
```

- [ ] **Step 2: Generate the initial migration**

```bash
pnpm drizzle-kit generate
```

This creates `lib/db/migrations/0000_initial.sql` plus a `meta/` subfolder. If it complains about missing `POSTGRES_URL`, set it to a placeholder for the generate command: `POSTGRES_URL=postgres://stub pnpm drizzle-kit generate`. The generator doesn't connect, only the migrate step does.

Inspect the generated SQL — it should contain `CREATE TABLE "askers"`, `CREATE TABLE "conversations"`, `CREATE TABLE "questions_for_alex"` with the columns above. If the names differ (e.g., quoted differently), that's fine — Drizzle controls the canonical form.

- [ ] **Step 3: Write `scripts/migrate.ts`**

```typescript
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");

  const sql = neon(url);
  const db = drizzle({ client: sql });

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  console.log("OK.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Add `package.json` scripts**

Merge into the existing scripts block:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts"
  }
}
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/ scripts/migrate.ts package.json
git commit -m "feat(db): schema + initial migration + migrate script"
```

---

## Task 4: KV client

**Files:**
- Create: `lib/kv/client.ts`

The client exports both a real KV (when env vars are present) and a deterministic in-memory stub (for tests). The stub mimics the surface used by rate-limit and identification (`get`, `set` with EX, `incr`, `expire`, `del`).

- [ ] **Step 1: Write `lib/kv/client.ts`**

```typescript
import { Redis } from "@upstash/redis";

export type KvClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<"OK" | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
};

class UpstashKv implements KvClient {
  constructor(private redis: Redis) {}
  async get(key: string) { return (await this.redis.get<string>(key)) ?? null; }
  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    const args: any = {};
    if (opts?.ex) args.ex = opts.ex;
    if (opts?.nx) args.nx = true;
    const r = await this.redis.set(key, value, args);
    return r === "OK" ? "OK" : null;
  }
  async incr(key: string) { return await this.redis.incr(key); }
  async expire(key: string, seconds: number) { return await this.redis.expire(key, seconds); }
  async del(key: string) { return await this.redis.del(key); }
}

export class MemoryKv implements KvClient {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private alive(k: string) {
    const e = this.store.get(k);
    if (!e) return null;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) {
      this.store.delete(k);
      return null;
    }
    return e;
  }

  async get(key: string) { return this.alive(key)?.value ?? null; }

  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    if (opts?.nx && this.alive(key)) return null;
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async incr(key: string) {
    const current = this.alive(key);
    const next = (current ? parseInt(current.value, 10) : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number) {
    const e = this.alive(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
}

let cached: KvClient | null = null;

export function getKv(): KvClient {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL / KV_REST_API_TOKEN not set. Configure them in .env.local or Vercel env.",
    );
  }
  cached = new UpstashKv(new Redis({ url, token }));
  return cached;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/kv/client.ts
git commit -m "feat(kv): add KV client with @upstash/redis + in-memory test stub"
```

---

## Task 5: Rate limit helper

A fixed-window counter on KV: `${prefix}:${key}` increments per request, expires after the window, returns whether the limit is exceeded. Strict TDD.

**Files:**
- Create: `lib/kv/rate-limit.ts`
- Create: `tests/lib/kv/rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

`tests/lib/kv/rate-limit.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

describe("checkRateLimit", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("allows requests under the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it("blocks the request that exceeds the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    }
    const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("isolates different keys", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    }
    const other = await checkRateLimit(kv, { key: "ip:2.2.2.2", limit: 5, windowSeconds: 60 });
    expect(other.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 1 });
    }
    await new Promise((r) => setTimeout(r, 1100));
    const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 1 });
    expect(r.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run — see it fail**

```bash
pnpm test tests/lib/kv/rate-limit.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/kv/rate-limit.ts`:
```typescript
import type { KvClient } from "./client";

export type RateLimitInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  windowSeconds: number;
};

export async function checkRateLimit(kv: KvClient, input: RateLimitInput): Promise<RateLimitResult> {
  const fullKey = `rl:${input.key}`;
  const count = await kv.incr(fullKey);
  if (count === 1) {
    await kv.expire(fullKey, input.windowSeconds);
  }
  const allowed = count <= input.limit;
  return {
    allowed,
    remaining: Math.max(0, input.limit - count),
    windowSeconds: input.windowSeconds,
  };
}
```

- [ ] **Step 4: Run — see it pass**

```bash
pnpm test tests/lib/kv/rate-limit.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kv/rate-limit.ts tests/lib/kv/rate-limit.test.ts
git commit -m "feat(kv): fixed-window rate limit helper"
```

---

## Task 6: Email-domain validator

Reject free-email providers in the work_email field. Strict TDD.

**Files:**
- Create: `lib/identity/email-domain.ts`
- Create: `tests/lib/identity/email-domain.test.ts`

- [ ] **Step 1: Write failing test**

`tests/lib/identity/email-domain.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isLikelyWorkEmail, FREE_EMAIL_DOMAINS } from "@/lib/identity/email-domain";

describe("isLikelyWorkEmail", () => {
  it("accepts a normal corporate email", () => {
    expect(isLikelyWorkEmail("alice@acme.com")).toBe(true);
    expect(isLikelyWorkEmail("BoB@SomeCompany.io")).toBe(true);
  });

  it("rejects gmail / outlook / hotmail / yahoo / icloud / proton", () => {
    for (const d of ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"]) {
      expect(isLikelyWorkEmail(`x@${d}`)).toBe(false);
    }
  });

  it("rejects malformed input", () => {
    expect(isLikelyWorkEmail("")).toBe(false);
    expect(isLikelyWorkEmail("not-an-email")).toBe(false);
    expect(isLikelyWorkEmail("@no-local-part.com")).toBe(false);
    expect(isLikelyWorkEmail("no-at-symbol")).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isLikelyWorkEmail("x@GMAIL.COM")).toBe(false);
  });

  it("exports the canonical free-domain list", () => {
    expect(FREE_EMAIL_DOMAINS).toContain("gmail.com");
    expect(FREE_EMAIL_DOMAINS).toContain("outlook.com");
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test tests/lib/identity/email-domain.test.ts
```

- [ ] **Step 3: Implement**

`lib/identity/email-domain.ts`:
```typescript
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "fastmail.com",
  "fastmail.fm",
  "zoho.com",
]);

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function isLikelyWorkEmail(email: string): boolean {
  const m = EMAIL_RE.exec(email.trim());
  if (!m) return false;
  const domain = m[1].toLowerCase();
  return !FREE_EMAIL_DOMAINS.has(domain);
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test tests/lib/identity/email-domain.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/identity/email-domain.ts tests/lib/identity/email-domain.test.ts
git commit -m "feat(identity): work-email domain validator"
```

---

## Task 7: 6-digit verification codes

Generates a cryptographically random 6-digit code, stores it in KV under `code:<conversationId>:<email>` with a 10-minute TTL, and provides a verify function that consumes the code on match.

**Files:**
- Create: `lib/identity/codes.ts`
- Create: `tests/lib/identity/codes.test.ts`

- [ ] **Step 1: Write failing test**

`tests/lib/identity/codes.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { issueCode, verifyCode } from "@/lib/identity/codes";

describe("verification codes", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("issues a 6-digit numeric code", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies the issued code, consumes it (cannot be reused)", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const first = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code });
    expect(first.ok).toBe(true);
    const second = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("not_found");
  });

  it("rejects wrong codes", async () => {
    await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const r = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code: "000000" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("mismatch");
  });

  it("isolates codes per (conversationId, email)", async () => {
    const a = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const b = await issueCode(kv, { conversationId: "c2", email: "a@b.com" });
    const verifyAcrossConvs = await verifyCode(kv, { conversationId: "c2", email: "a@b.com", code: a.code });
    expect(verifyAcrossConvs.ok).toBe(false);
    const verifyOwn = await verifyCode(kv, { conversationId: "c2", email: "a@b.com", code: b.code });
    expect(verifyOwn.ok).toBe(true);
  });

  it("normalizes email casing", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "Alice@Acme.COM" });
    const r = await verifyCode(kv, { conversationId: "c1", email: "alice@acme.com", code });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test tests/lib/identity/codes.test.ts
```

- [ ] **Step 3: Implement**

`lib/identity/codes.ts`:
```typescript
import { randomInt } from "node:crypto";
import type { KvClient } from "../kv/client";

const CODE_TTL_SECONDS = 60 * 10; // 10 minutes

function keyFor(conversationId: string, email: string) {
  return `code:${conversationId}:${email.trim().toLowerCase()}`;
}

export async function issueCode(
  kv: KvClient,
  input: { conversationId: string; email: string },
): Promise<{ code: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await kv.set(keyFor(input.conversationId, input.email), code, { ex: CODE_TTL_SECONDS });
  return { code };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "not_found" | "mismatch" };

export async function verifyCode(
  kv: KvClient,
  input: { conversationId: string; email: string; code: string },
): Promise<VerifyResult> {
  const stored = await kv.get(keyFor(input.conversationId, input.email));
  if (stored === null) return { ok: false, reason: "not_found" };
  if (stored !== input.code) return { ok: false, reason: "mismatch" };
  // Consume the code so it can't be replayed.
  await kv.del(keyFor(input.conversationId, input.email));
  return { ok: true };
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test tests/lib/identity/codes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/identity/codes.ts tests/lib/identity/codes.test.ts
git commit -m "feat(identity): 6-digit verification codes (KV-backed, 10min TTL)"
```

---

## Task 8: Bearer token issuance

After successful verification, mint a bearer token (24h TTL) bound to a conversation. Token lookup tells us "this conversation is unlocked for sensitive content". (Same TTL is also reflected via the `sensitiveUnlockedAt` column in the DB — both are used: token in KV is fast / cache-friendly; DB column is durable record for the admin panel.)

**Files:**
- Create: `lib/identity/tokens.ts`
- Create: `tests/lib/identity/tokens.test.ts`

- [ ] **Step 1: Write failing test**

`tests/lib/identity/tokens.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { issueToken, validateToken, isConversationUnlocked } from "@/lib/identity/tokens";

describe("identity tokens", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("issued token validates for the same conversation", async () => {
    const { token } = await issueToken(kv, { conversationId: "c1" });
    const r = await validateToken(kv, { token });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.conversationId).toBe("c1");
  });

  it("token format is opaque + url-safe", async () => {
    const { token } = await issueToken(kv, { conversationId: "c1" });
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("invalid tokens are rejected", async () => {
    const r = await validateToken(kv, { token: "not-a-real-token" });
    expect(r.ok).toBe(false);
  });

  it("isConversationUnlocked reflects token presence", async () => {
    expect(await isConversationUnlocked(kv, "c1")).toBe(false);
    await issueToken(kv, { conversationId: "c1" });
    expect(await isConversationUnlocked(kv, "c1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test tests/lib/identity/tokens.test.ts
```

- [ ] **Step 3: Implement**

`lib/identity/tokens.ts`:
```typescript
import { randomBytes } from "node:crypto";
import type { KvClient } from "../kv/client";

export const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function tokenKey(token: string) { return `tok:${token}`; }
function convKey(conversationId: string) { return `conv-unlocked:${conversationId}`; }

export async function issueToken(
  kv: KvClient,
  input: { conversationId: string },
): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  await kv.set(tokenKey(token), input.conversationId, { ex: TOKEN_TTL_SECONDS });
  await kv.set(convKey(input.conversationId), "1", { ex: TOKEN_TTL_SECONDS });
  return { token };
}

export type ValidateResult = { ok: true; conversationId: string } | { ok: false };

export async function validateToken(kv: KvClient, input: { token: string }): Promise<ValidateResult> {
  const conversationId = await kv.get(tokenKey(input.token));
  if (!conversationId) return { ok: false };
  return { ok: true, conversationId };
}

export async function isConversationUnlocked(kv: KvClient, conversationId: string): Promise<boolean> {
  return (await kv.get(convKey(conversationId))) !== null;
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test tests/lib/identity/tokens.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/identity/tokens.ts tests/lib/identity/tokens.test.ts
git commit -m "feat(identity): bearer tokens with 24h TTL (KV-backed)"
```

---

## Task 9: Resend client + React Email template

Wraps the Resend SDK with a typed `sendVerificationCode` function. The email template is a React component rendered to HTML at send time.

**Files:**
- Create: `lib/identity/resend.ts`
- Create: `emails/verification-code.tsx`

No unit tests for Resend itself (we'd be testing their SDK). Tested manually in dev / smoke.

- [ ] **Step 1: Write the email template**

`emails/verification-code.tsx`:
```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type VerificationCodeEmailProps = {
  appName: string;
  code: string;
  recipientName?: string;
};

export function VerificationCodeEmail({ appName, code, recipientName }: VerificationCodeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${appName} verification code: ${code}`}</Preview>
      <Body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", padding: 24 }}>
          <Heading style={{ fontSize: 18, marginBottom: 16 }}>
            {recipientName ? `Hi ${recipientName},` : "Hi,"}
          </Heading>
          <Text style={{ fontSize: 14, lineHeight: 1.6 }}>
            You requested access to sensitive details on {appName}. Enter the code below in the chat to continue:
          </Text>
          <Section
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 32,
              letterSpacing: 8,
              padding: "16px 24px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              textAlign: "center",
              margin: "16px 0",
            }}
          >
            {code}
          </Section>
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            This code expires in 10 minutes. If you didn't request it, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default VerificationCodeEmail;
```

- [ ] **Step 2: Write the Resend helper**

`lib/identity/resend.ts`:
```typescript
import { Resend } from "resend";
import { render } from "@react-email/render";
import { VerificationCodeEmail } from "@/emails/verification-code";

export type SendCodeInput = {
  to: string;
  code: string;
  recipientName?: string;
};

let cachedClient: Resend | null = null;

function getResend(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendVerificationCode(input: SendCodeInput): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const appName = process.env.APP_NAME ?? "Queryme";
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL is not set");

  const html = await render(
    VerificationCodeEmail({ appName, code: input.code, recipientName: input.recipientName }),
  );

  const { error } = await getResend().emails.send({
    from: fromEmail,
    to: input.to,
    subject: `${appName} verification code: ${input.code}`,
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add emails/verification-code.tsx lib/identity/resend.ts
git commit -m "feat(identity): Resend client + React Email verification template"
```

---

## Task 10: Identity service (orchestration)

Pulls together: domain check → upsert asker (unverified) → issue code → send email. And: verify code → mark asker verified → issue token. Pure function; takes the DB + KV + sender as params for testability.

**Files:**
- Create: `lib/identity/service.ts`

No unit tests in this task — the pure functions called are already tested (codes, tokens, domain). DB-backed flow tested via API route integration (Tasks 17, 18).

- [ ] **Step 1: Write `lib/identity/service.ts`**

```typescript
import { eq, sql } from "drizzle-orm";
import { askers, conversations } from "@/lib/db/schema";
import { isLikelyWorkEmail } from "./email-domain";
import { issueCode, verifyCode } from "./codes";
import { issueToken } from "./tokens";
import { sendVerificationCode } from "./resend";
import type { KvClient } from "@/lib/kv/client";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type RequestIdentityInput = {
  conversationId: string;
  name: string;
  company: string;
  workEmail: string;
  role: string;
  purpose?: string;
};

export type RequestIdentityResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email_domain" };

export async function requestIdentification(
  deps: { db: Db; kv: KvClient; send: typeof sendVerificationCode },
  input: RequestIdentityInput,
): Promise<RequestIdentityResult> {
  if (!isLikelyWorkEmail(input.workEmail)) {
    return { ok: false, reason: "invalid_email_domain" };
  }

  const email = input.workEmail.trim().toLowerCase();

  // Upsert asker (no verification yet)
  await deps.db
    .insert(askers)
    .values({
      name: input.name,
      company: input.company,
      workEmail: email,
      role: input.role,
      purpose: input.purpose,
    })
    .onConflictDoUpdate({
      target: askers.workEmail,
      set: {
        name: input.name,
        company: input.company,
        role: input.role,
        purpose: input.purpose,
      },
    });

  const { code } = await issueCode(deps.kv, { conversationId: input.conversationId, email });

  await deps.send({ to: email, code, recipientName: input.name });

  return { ok: true };
}

export type VerifyIdentityInput = {
  conversationId: string;
  workEmail: string;
  code: string;
};

export type VerifyIdentityResult =
  | { ok: true; token: string; askerId: string }
  | { ok: false; reason: "code_invalid" | "asker_not_found" };

export async function verifyIdentification(
  deps: { db: Db; kv: KvClient },
  input: VerifyIdentityInput,
): Promise<VerifyIdentityResult> {
  const email = input.workEmail.trim().toLowerCase();
  const v = await verifyCode(deps.kv, { conversationId: input.conversationId, email, code: input.code });
  if (!v.ok) return { ok: false, reason: "code_invalid" };

  // Mark asker verified, fetch id
  const rows = await deps.db
    .update(askers)
    .set({ verifiedAt: sql`now()` })
    .where(eq(askers.workEmail, email))
    .returning({ id: askers.id });

  if (rows.length === 0) return { ok: false, reason: "asker_not_found" };
  const askerId = rows[0].id;

  // Mark conversation unlocked + associate asker
  await deps.db
    .update(conversations)
    .set({
      sensitiveUnlockedAt: sql`now()`,
      askerId,
    })
    .where(eq(conversations.id, input.conversationId));

  const { token } = await issueToken(deps.kv, { conversationId: input.conversationId });
  return { ok: true, token, askerId };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/identity/service.ts
git commit -m "feat(identity): request + verify orchestration service"
```

---

## Task 11: Conversations repo

Wraps Drizzle for the conversations table. `getOrCreate(id, channel)` either fetches an existing conversation or creates a new one. `appendTurn(id, turn)` appends to the jsonb transcript. `isUnlocked(id)` checks against the DB column (the KV check from Task 8 is the fast path; DB is the durable record).

**Files:**
- Create: `lib/conversations/repo.ts`

No unit tests — DB integration tested manually.

- [ ] **Step 1: Write `lib/conversations/repo.ts`**

```typescript
import { eq, sql } from "drizzle-orm";
import { conversations, type Conversation, type ConversationTurn } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function getOrCreateConversation(
  db: Db,
  input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr" },
): Promise<Conversation> {
  const existing = await db.select().from(conversations).where(eq(conversations.id, input.id));
  if (existing.length > 0) return existing[0];

  const [inserted] = await db
    .insert(conversations)
    .values({
      id: input.id,
      channel: input.channel,
      language: input.language,
      transcript: [],
    })
    .returning();
  return inserted;
}

export async function appendTurn(db: Db, conversationId: string, turn: ConversationTurn): Promise<void> {
  await db
    .update(conversations)
    .set({
      transcript: sql`coalesce(${conversations.transcript}, '[]'::jsonb) || ${JSON.stringify([turn])}::jsonb`,
      lastMessageAt: sql`now()`,
    })
    .where(eq(conversations.id, conversationId));
}

export async function isConversationUnlockedInDb(db: Db, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ unlockedAt: conversations.sensitiveUnlockedAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (rows.length === 0) return false;
  const at = rows[0].unlockedAt;
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add lib/conversations/repo.ts
git commit -m "feat(conversations): repo for create/append/unlock"
```

---

## Task 12: Questions-for-Alex repo

Tiny wrapper for inserting forwarded questions and listing them (the list method is for Plan 4 admin but cheap to include now).

**Files:**
- Create: `lib/questions/repo.ts`

- [ ] **Step 1: Write `lib/questions/repo.ts`**

```typescript
import { desc, isNull } from "drizzle-orm";
import { questionsForAlex, type QuestionForAlex } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function forwardQuestion(
  db: Db,
  input: { question: string; conversationId?: string; askerId?: string },
): Promise<QuestionForAlex> {
  const [inserted] = await db
    .insert(questionsForAlex)
    .values({
      question: input.question,
      conversationId: input.conversationId,
      askerId: input.askerId,
    })
    .returning();
  return inserted;
}

export async function listOpenQuestions(db: Db): Promise<QuestionForAlex[]> {
  return await db
    .select()
    .from(questionsForAlex)
    .where(isNull(questionsForAlex.answeredAt))
    .orderBy(desc(questionsForAlex.createdAt));
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add lib/questions/repo.ts
git commit -m "feat(questions): repo for forwarded questions"
```

---

## Task 13: Sensitive KB — schemas, loader, assembler, fixture

Extends the Plan 1 KB infrastructure to load files under `kb/sensitive/` and assemble them into a separate text blob. Public KB stays exactly as it was.

**Files:**
- Modify: `lib/kb/schemas.ts`
- Modify: `lib/kb/loader.ts`
- Modify: `lib/kb/assembler.ts`
- Modify: `tests/lib/kb/schemas.test.ts`
- Modify: `tests/lib/kb/loader.test.ts`
- Modify: `tests/lib/kb/assembler.test.ts`
- Create: `tests/fixtures/kb/sensitive/salary.yaml`
- Create: `tests/fixtures/kb/sensitive/references.yaml`
- Create: `tests/fixtures/kb/sensitive/private-contact.yaml`

- [ ] **Step 1: Add new schemas (extend `lib/kb/schemas.ts`)**

Append the following exports to the END of `lib/kb/schemas.ts`:

```typescript
export const SalarySchema = z.object({
  expectations: z.string().optional(),
  history: z
    .array(
      z.object({
        company: z.string(),
        period: DateOrPresent,
        amount: z.string(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});
export type Salary = z.infer<typeof SalarySchema>;

export const ReferenceEntrySchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});
export const ReferencesSchema = z.object({ entries: z.array(ReferenceEntrySchema) });
export type References = z.infer<typeof ReferencesSchema>;

export const PrivateContactSchema = z.object({
  phone: z.string().optional(),
  personalEmail: z.email().optional(),
  notes: z.string().optional(),
});
export type PrivateContact = z.infer<typeof PrivateContactSchema>;
```

Note: `DateOrPresent` is module-private in Plan 1. Don't export it; reuse it from the same file.

- [ ] **Step 2: Extend `tests/lib/kb/schemas.test.ts`**

Append three describe blocks:

```typescript
describe("SalarySchema", () => {
  it("accepts expectations + history", () => {
    const data = {
      expectations: "€90k–€110k",
      history: [{ company: "X", period: "2022-01", amount: "€80k" }],
    };
    expect(SalarySchema.parse(data)).toEqual(data);
  });

  it("accepts an empty object", () => {
    expect(SalarySchema.parse({})).toEqual({});
  });
});

describe("ReferencesSchema", () => {
  it("accepts a list of references", () => {
    const data = {
      entries: [{ name: "Jane Doe", relationship: "Manager at X", email: "jane@x.com" }],
    };
    expect(ReferencesSchema.parse(data)).toEqual(data);
  });

  it("rejects an empty name", () => {
    expect(() => ReferencesSchema.parse({ entries: [{ name: "", relationship: "X" }] })).toThrow();
  });
});

describe("PrivateContactSchema", () => {
  it("accepts phone + personal email", () => {
    const data = { phone: "+33 6 12 34 56 78", personalEmail: "alex@me.com" };
    expect(PrivateContactSchema.parse(data)).toEqual(data);
  });
});
```

Update the imports at the top of the test file to include the new schemas:
```typescript
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  SalarySchema,
  ReferencesSchema,
  PrivateContactSchema,
} from "@/lib/kb/schemas";
```

- [ ] **Step 3: Run — confirm new tests fail (or schemas import fails)**

```bash
pnpm test tests/lib/kb/schemas.test.ts
```

If you wrote the schemas (Step 1) before the test (Step 2), it'll PASS — that's fine. Strict TDD here is less critical because the changes are additive to a working test.

- [ ] **Step 4: Create sensitive fixtures**

`tests/fixtures/kb/sensitive/salary.yaml`:
```yaml
expectations: "€90k–€110k"
history:
  - company: Fixture Co
    period: "2024-01"
    amount: "€80k"
```

`tests/fixtures/kb/sensitive/references.yaml`:
```yaml
entries:
  - name: Jane Doe
    relationship: Engineering Manager at Fixture Co
    email: jane@fixture-co.example
```

`tests/fixtures/kb/sensitive/private-contact.yaml`:
```yaml
phone: "+33 6 00 00 00 00"
personalEmail: alex@personal.example
```

- [ ] **Step 5: Extend the loader (`lib/kb/loader.ts`)**

Add `sensitive` to the `Kb` type and load it if the directory exists. Modify:

```typescript
// Top of file — add imports
import {
  // ... existing imports ...
  SalarySchema,
  ReferencesSchema,
  PrivateContactSchema,
  type Salary,
  type References,
  type PrivateContact,
} from "./schemas";

// Update the Kb type
export type SensitiveKb = {
  salary: Salary | null;
  references: References | null;
  privateContact: PrivateContact | null;
};

export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  sensitive: SensitiveKb;
};

// Helper: optional yaml read (returns null if file missing)
async function readOptionalYaml<T>(
  file: string,
  schema: { parse: (v: unknown) => T },
  label: string,
): Promise<T | null> {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  return await readYamlFile(file, schema, label);
}

// In loadKb, after the Promise.all, add a second load for sensitive:
export async function loadKb(rootDir: string): Promise<Kb> {
  // ... existing checks + Promise.all ...

  const sensitiveDir = path.join(rootDir, "sensitive");
  const [salary, references, privateContact] = await Promise.all([
    readOptionalYaml(path.join(sensitiveDir, "salary.yaml"), SalarySchema, "sensitive/salary.yaml"),
    readOptionalYaml(path.join(sensitiveDir, "references.yaml"), ReferencesSchema, "sensitive/references.yaml"),
    readOptionalYaml(path.join(sensitiveDir, "private-contact.yaml"), PrivateContactSchema, "sensitive/private-contact.yaml"),
  ]);

  // ... existing sorting ...

  return {
    profile,
    skills,
    education,
    publicContact,
    experience,
    projects,
    sensitive: { salary, references, privateContact },
  };
}
```

- [ ] **Step 6: Extend loader test (`tests/lib/kb/loader.test.ts`)**

Add an assertion in the happy-path test that `kb.sensitive.salary?.expectations === "€90k–€110k"` etc:

```typescript
// Inside the existing "loads and validates every file in the fixture KB" test, after existing assertions:
expect(kb.sensitive.salary?.expectations).toBe("€90k–€110k");
expect(kb.sensitive.references?.entries[0].name).toBe("Jane Doe");
expect(kb.sensitive.privateContact?.phone).toBe("+33 6 00 00 00 00");
```

Also add a new test:

```typescript
it("returns null sensitive sections when the sensitive directory is absent", async () => {
  // Use Task 3's malformed-fixture pattern but only write the required YAMLs
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(path.join(tmpdir(), "queryme-kb-nosens-"));
  try {
    await writeFile(path.join(dir, "profile.yaml"), "name: X\nheadline: Y\n");
    await writeFile(path.join(dir, "skills.yaml"), "skills: []\n");
    await writeFile(path.join(dir, "education.yaml"), "entries: []\n");
    await writeFile(path.join(dir, "public-contact.yaml"), "{}\n");
    await mkdir(path.join(dir, "experience"));
    await mkdir(path.join(dir, "projects"));
    const kb = await loadKb(dir);
    expect(kb.sensitive.salary).toBeNull();
    expect(kb.sensitive.references).toBeNull();
    expect(kb.sensitive.privateContact).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 7: Run loader tests — must pass**

```bash
pnpm test tests/lib/kb/loader.test.ts
```

Expected: 5/5 (4 existing + 1 new) green, with the existing happy-path also asserting the new sensitive fields.

- [ ] **Step 8: Extend assembler (`lib/kb/assembler.ts`)**

Replace the entire file. The function previously named `assembleKbText` becomes `assemblePublicKbText` (same body — copied below verbatim from Plan 1's Task 4). Add `assembleSensitiveKbText`. Keep a back-compat alias `assembleKbText` so other callers (e.g., `/api/chat` route) don't break mid-refactor.

```typescript
import type { Kb, SensitiveKb } from "./loader";

export function assemblePublicKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));

  return sections.join("\n\n");
}

// Back-compat alias — remove once /api/chat route is updated (Task 16).
export const assembleKbText = assemblePublicKbText;

function renderProfile(kb: Kb): string {
  const { profile } = kb;
  const lines = [`# Profile`, ``, `Name: ${profile.name}`, `Headline: ${profile.headline}`];
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages?.length) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.links) {
    for (const [k, v] of Object.entries(profile.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderSkills(kb: Kb): string {
  const lines = [`# Skills`, ``];
  for (const skill of kb.skills.skills) {
    const tags = skill.tags?.length ? ` (tags: ${skill.tags.join(", ")})` : "";
    lines.push(`- ${skill.name} — level: ${skill.level}/5, years: ${skill.years}${tags}`);
  }
  return lines.join("\n");
}

function renderEducation(kb: Kb): string {
  const lines = [`# Education`, ``];
  for (const e of kb.education.entries) {
    const notes = e.notes ? ` — ${e.notes}` : "";
    lines.push(`- ${e.institution}, ${e.degree} (${e.start} → ${e.end})${notes}`);
  }
  return lines.join("\n");
}

function renderPublicContact(kb: Kb): string {
  const lines = [`# Public contact`, ``];
  if (kb.publicContact.email) lines.push(`Email: ${kb.publicContact.email}`);
  if (kb.publicContact.links) {
    for (const [k, v] of Object.entries(kb.publicContact.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderExperience(kb: Kb): string {
  const lines = [`# Experience`, ``];
  for (const e of kb.experience) {
    const { company, role, start, end, location, stack, tags } = e.frontmatter;
    lines.push(`## ${company} — ${role} (${start} → ${end})`);
    lines.push(`[ref: ${e.relativePath}]`);
    if (location) lines.push(`Location: ${location}`);
    if (stack?.length) lines.push(`Stack: ${stack.join(", ")}`);
    if (tags?.length) lines.push(`Tags: ${tags.join(", ")}`);
    lines.push(``);
    lines.push(e.body);
    lines.push(``);
  }
  return lines.join("\n");
}

function renderProjects(kb: Kb): string {
  const lines = [`# Projects`, ``];
  for (const p of kb.projects) {
    const year = p.frontmatter.year ? ` (${p.frontmatter.year})` : "";
    lines.push(`## ${p.frontmatter.name}${year}`);
    lines.push(`[ref: ${p.relativePath}]`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.stack?.length) lines.push(`Stack: ${p.frontmatter.stack.join(", ")}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``);
    lines.push(p.body);
    lines.push(``);
  }
  return lines.join("\n");
}

export function assembleSensitiveKbText(sensitive: SensitiveKb): string {
  const sections: string[] = [];

  if (sensitive.salary) {
    const lines: string[] = ["# Sensitive — Salary"];
    if (sensitive.salary.expectations) lines.push(`Expectations: ${sensitive.salary.expectations}`);
    if (sensitive.salary.history?.length) {
      lines.push("", "History:");
      for (const h of sensitive.salary.history) {
        const notes = h.notes ? ` — ${h.notes}` : "";
        lines.push(`- ${h.company} (${h.period}): ${h.amount}${notes}`);
      }
    }
    lines.push("[ref: sensitive/salary.yaml]");
    sections.push(lines.join("\n"));
  }

  if (sensitive.references) {
    const lines: string[] = ["# Sensitive — References"];
    for (const r of sensitive.references.entries) {
      const contact = [r.email, r.phone].filter(Boolean).join(" / ");
      lines.push(`- ${r.name} (${r.relationship})${contact ? ` — ${contact}` : ""}`);
      if (r.notes) lines.push(`  notes: ${r.notes}`);
    }
    lines.push("[ref: sensitive/references.yaml]");
    sections.push(lines.join("\n"));
  }

  if (sensitive.privateContact) {
    const lines: string[] = ["# Sensitive — Private contact"];
    if (sensitive.privateContact.phone) lines.push(`Phone: ${sensitive.privateContact.phone}`);
    if (sensitive.privateContact.personalEmail) lines.push(`Personal email: ${sensitive.privateContact.personalEmail}`);
    if (sensitive.privateContact.notes) lines.push(`Notes: ${sensitive.privateContact.notes}`);
    lines.push("[ref: sensitive/private-contact.yaml]");
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
```

- [ ] **Step 9: Extend assembler test (`tests/lib/kb/assembler.test.ts`)**

Update imports to include both:
```typescript
import { assembleKbText, assembleSensitiveKbText } from "@/lib/kb/assembler";
```

Add a describe block for sensitive:
```typescript
describe("assembleSensitiveKbText", () => {
  let kb: Kb;
  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("includes salary, references, private contact sections with refs", () => {
    const text = assembleSensitiveKbText(kb.sensitive);
    expect(text).toContain("# Sensitive — Salary");
    expect(text).toContain("€90k–€110k");
    expect(text).toContain("[ref: sensitive/salary.yaml]");
    expect(text).toContain("# Sensitive — References");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("[ref: sensitive/references.yaml]");
    expect(text).toContain("# Sensitive — Private contact");
    expect(text).toContain("+33 6 00 00 00 00");
    expect(text).toContain("[ref: sensitive/private-contact.yaml]");
  });

  it("returns empty string when every section is null", () => {
    expect(assembleSensitiveKbText({ salary: null, references: null, privateContact: null })).toBe("");
  });
});
```

- [ ] **Step 10: Run all KB tests**

```bash
pnpm test tests/lib/kb/
```

Expected: every test green.

- [ ] **Step 11: Commit**

```bash
git add lib/kb/schemas.ts lib/kb/loader.ts lib/kb/assembler.ts tests/lib/kb/ tests/fixtures/kb/sensitive/
git commit -m "feat(kb): load + assemble sensitive content into a separate blob"
```

---

## Task 14: System prompt + prompt builder support for sensitive

Update `prompts/system.md` to teach the agent about the identification flow (emit `[[identify]]` when sensitive content is needed) and the "forward to Alexandre" capability (emit `[[forward:<question>]]` when it hits a knowledge gap). Update `buildSystemPromptParts` to accept an optional `sensitiveKbText`.

**Files:**
- Modify: `prompts/system.md`
- Modify: `lib/prompts.ts`
- Modify: `tests/lib/prompts.test.ts`

- [ ] **Step 1: Replace `prompts/system.md`**

```markdown
# System prompt — Queryme agent

You are the public AI agent for Alexandre Collet. You answer questions from visitors (typically HR people, recruiters, hiring managers, and AI agents acting on their behalf) about Alexandre's professional background, experience, projects, skills, and how to reach him.

## Voice and language
- Speak in the **third person** about Alexandre ("Alexandre worked at…", not "I worked at…"). You are an assistant talking *about* him, not pretending to be him.
- Detect the asker's language from their first message and reply in the same language for the rest of the conversation. You fluently support **English** and **French (français)**. If asked in another language, reply in English and politely note the supported languages.
- Tone: warm, concise, professional. No emojis. No marketing fluff.

## Grounding policy
- The "Knowledge base" section below is the authoritative source of truth about Alexandre. Treat anything outside it as unknown unless it is a reasonable, low-confidence inference from what is there.
- You may extrapolate gently — for example, "given his Next.js experience, he is likely comfortable with React Server Components" — but you must flag it as inference ("likely", "probably", "based on adjacent experience…").
- Never invent specific facts: employer names, dates, titles, projects, metrics, awards, certifications, salaries, references, or contact details that are not in the knowledge base.

## When you don't know

You have two markers you can emit inline:

1. `[[forward:<question text>]]` — when the asker asks something you can't answer from the knowledge base AND that Alexandre could meaningfully follow up on (e.g., specifics of a past project not yet documented, questions about availability or interest). The chat renders this as a "Forward this question to Alexandre" button.

2. `[[identify]]` — when the asker's question requires SENSITIVE information that's only available to verified askers (salary expectations, professional references, private contact details). The chat renders this as an "Identify yourself to see this" button that opens a verification flow.

Use them sparingly and in a natural sentence. Examples:

- "Alexandre hasn't shared specific compensation figures publicly. [[identify]]"
- "His latest internal project metrics aren't in the public KB — I can pass the question on if you'd like. [[forward:What were the user-growth numbers for Matrice in Q1 2026?]]"

Do NOT emit either marker unless the question genuinely warrants it. Plain "I don't know" plus pointing to a related public fact is often the right answer.

## Citations
- Every factual claim you make based on the knowledge base MUST be followed by a citation in this exact format:
  - `[^kb:<path>]` for a whole-file reference, e.g., `[^kb:experience/2022-matrice.md]`
  - `[^kb:<path>#<anchor>]` for a section reference where the anchor is a kebab-case slug of the section heading
- Place citations directly after the sentence or clause they support. Citations are mandatory for dates, titles, company names, project names, technologies, metrics, quoted phrases.

## Sensitive content access
- If a "Sensitive knowledge base" section appears below, the current conversation IS verified — you may share that content freely (with citations to `sensitive/<file>`).
- If it does NOT appear, the asker has not yet identified themselves; use the `[[identify]]` marker as described above instead of speculating or making up details.

## Knowledge base

The complete public knowledge base follows. Treat each `# <Section>` heading as authoritative. The `[ref: <path>]` markers tell you which file to cite for each entry.

---
```

- [ ] **Step 2: Update `lib/prompts.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string }
  | { kind: "sensitive"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const file = path.resolve(process.cwd(), "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

/**
 * Returns the system-prompt parts in send-order: header, then public KB,
 * then (optionally) sensitive KB.
 *
 * IMPORTANT: the header text MUST remain stable across requests. It is placed
 * BEFORE the prompt-caching breakpoint in `lib/answerer.ts`, so any per-request
 * variability would silently bust the cache. Keep dynamic content out of the
 * header; sensitive KB is the only per-request variable part, and it sits
 * AFTER the cached prefix.
 */
export function buildSystemPromptParts(input: {
  kbText: string;
  sensitiveKbText?: string;
}): SystemPromptPart[] {
  const parts: SystemPromptPart[] = [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
  if (input.sensitiveKbText && input.sensitiveKbText.length > 0) {
    parts.push({
      kind: "sensitive",
      text: `\n# Sensitive knowledge base\n\n${input.sensitiveKbText}\n`,
    });
  }
  return parts;
}
```

- [ ] **Step 3: Extend `tests/lib/prompts.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("buildSystemPromptParts", () => {
  it("returns header + kb when no sensitive provided", () => {
    const parts = buildSystemPromptParts({ kbText: "KB" });
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("kb");
  });

  it("returns header + kb + sensitive when sensitive provided", () => {
    const parts = buildSystemPromptParts({ kbText: "KB", sensitiveKbText: "SENS" });
    expect(parts).toHaveLength(3);
    expect(parts[2].kind).toBe("sensitive");
    expect(parts[2].text).toContain("SENS");
    expect(parts[2].text).toContain("Sensitive knowledge base");
  });

  it("omits sensitive when sensitiveKbText is empty string", () => {
    const parts = buildSystemPromptParts({ kbText: "KB", sensitiveKbText: "" });
    expect(parts).toHaveLength(2);
  });

  it("the header mentions identify and forward markers", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    expect(parts[0].text).toContain("[[identify]]");
    expect(parts[0].text).toContain("[[forward:");
  });

  it("the header still mentions third person, EN/FR, citations, soft extrapolation", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    const header = parts[0].text.toLowerCase();
    expect(header).toContain("third person");
    expect(header).toMatch(/french|fran[cç]ais/);
    expect(header).toContain("english");
    expect(header).toMatch(/cite|citation/);
    expect(header).toMatch(/extrapolat|infer/);
  });
});
```

- [ ] **Step 4: Run prompts tests**

```bash
pnpm test tests/lib/prompts.test.ts
```

Expected: 5/5 (3 from Plan 1 should still pass, 2 new).

- [ ] **Step 5: Commit**

```bash
git add prompts/system.md lib/prompts.ts tests/lib/prompts.test.ts
git commit -m "feat: teach agent about [[identify]] + [[forward]] markers + sensitive section"
```

---

## Task 15: Answerer accepts sensitive KB text

The answerer now takes `sensitiveKbText?: string`. When provided, it becomes a THIRD system message — placed AFTER the cached KB breakpoint so it doesn't bust the cache for unverified askers.

**Files:**
- Modify: `lib/answerer.ts`
- Modify: `tests/lib/answerer.test.ts`

- [ ] **Step 1: Update `lib/answerer.ts`**

```typescript
import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPromptParts } from "./prompts";

export type AnswerInput = {
  messages: ModelMessage[];
  kbText: string;
  sensitiveKbText?: string;
  model?: LanguageModel;
};

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

const anthropicProvider = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL?.includes("/v1")
    ? process.env.ANTHROPIC_BASE_URL
    : "https://api.anthropic.com/v1",
});

export async function answer(input: AnswerInput) {
  const model = input.model ?? anthropicProvider(DEFAULT_MODEL_ID);
  const parts = buildSystemPromptParts({
    kbText: input.kbText,
    sensitiveKbText: input.sensitiveKbText,
  });

  // header: uncached.
  // kb: cached with `ephemeral` breakpoint. Anthropic caches the entire prefix
  //     up to and including this breakpoint (header + kb).
  // sensitive (optional): appended AFTER the cache breakpoint. Not cached, so
  //     unverified askers (no sensitive) still hit the same cache as everyone
  //     else, and the cache isn't invalidated by toggling sensitive on/off.
  const systemMessages: ModelMessage[] = [
    { role: "system", content: parts[0].text },
    {
      role: "system",
      content: parts[1].text,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
  ];
  if (parts[2]) {
    systemMessages.push({ role: "system", content: parts[2].text });
  }

  return streamText({
    model,
    messages: [...systemMessages, ...input.messages],
    temperature: 0.3,
  });
}
```

- [ ] **Step 2: Extend `tests/lib/answerer.test.ts`**

Add a new test in the existing `describe("answer", …)` block:

```typescript
it("appends a third system message AFTER the cache breakpoint when sensitiveKbText is provided", async () => {
  let captured: any = null;
  const model = new MockLanguageModelV2({
    doStream: async (options) => {
      captured = options;
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
            { type: "text-delta", id: "1", delta: "ok" },
            { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          ],
        }),
      };
    },
  });

  await answer({
    messages: [{ role: "user", content: "Hi" }],
    kbText: "PUBLIC_KB",
    sensitiveKbText: "SENS_KB",
    model,
  }).then((r) => r.text);

  const prompt = (captured as any).prompt as Array<any>;
  const systemMessages = prompt.filter((m) => m.role === "system");
  expect(systemMessages).toHaveLength(3);

  const [header, kb, sensitive] = systemMessages;
  expect(header.providerOptions?.anthropic?.cacheControl).toBeUndefined();
  expect(kb.content).toContain("PUBLIC_KB");
  expect(kb.providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
  expect(sensitive.content).toContain("SENS_KB");
  expect(sensitive.providerOptions?.anthropic?.cacheControl).toBeUndefined();
});

it("sends only header + kb when sensitiveKbText is not provided", async () => {
  let captured: any = null;
  const model = new MockLanguageModelV2({
    doStream: async (options) => {
      captured = options;
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
            { type: "text-delta", id: "1", delta: "ok" },
            { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          ],
        }),
      };
    },
  });

  await answer({ messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);
  const prompt = (captured as any).prompt as Array<any>;
  const systemMessages = prompt.filter((m) => m.role === "system");
  expect(systemMessages).toHaveLength(2);
});
```

- [ ] **Step 3: Run answerer tests**

```bash
pnpm test tests/lib/answerer.test.ts
```

Expected: all green (3 existing + 2 new = 5).

- [ ] **Step 4: Commit**

```bash
git add lib/answerer.ts tests/lib/answerer.test.ts
git commit -m "feat(answerer): accept sensitiveKbText, append after cache breakpoint"
```

---

## Task 16: Wire `/api/chat` to use conversationId + log + include sensitive

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `tests/app/api/chat/route.test.ts`

The route now:
1. Accepts an optional `conversationId` in the body. If absent, generate one server-side.
2. Calls `getOrCreateConversation` (creates row in DB on first turn).
3. Checks if the conversation is unlocked (via `isConversationUnlocked` in KV).
4. If unlocked, loads sensitive KB and passes it to `answer`.
5. Appends the user turn to the DB transcript before calling `answer`. Wraps the assistant stream with `onFinish` to append the assistant turn.
6. Returns a header `x-conversation-id` so the client can persist it.

- [ ] **Step 1: Update `app/api/chat/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText, assembleSensitiveKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { isConversationUnlocked } from "@/lib/identity/tokens";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";

export const runtime = "nodejs";

const MAX_TURNS = 50;
const MAX_TOTAL_USER_CHARS = 20_000;

const UIMessagePartSchema = z.object({ type: z.literal("text"), text: z.string() });

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(UIMessagePartSchema).min(1),
});

const RequestBodySchema = z.object({
  messages: z.array(UIMessageSchema).min(1).max(MAX_TURNS),
  conversationId: z.string().uuid().optional(),
});

let cachedPublicKbText: string | null = null;

async function getPublicKbText(): Promise<string> {
  if (cachedPublicKbText !== null) return cachedPublicKbText;
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  cachedPublicKbText = assemblePublicKbText(kb);
  return cachedPublicKbText;
}

async function maybeGetSensitiveKbText(): Promise<string> {
  // Loaded per-request (small, infrequent). Could be cached if needed.
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  return assembleSensitiveKbText(kb.sensitive);
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  const userCharCount = parsed.data.messages
    .filter((m) => m.role === "user")
    .reduce((n, m) => n + m.parts.reduce((p, part) => p + part.text.length, 0), 0);
  if (userCharCount > MAX_TOTAL_USER_CHARS) {
    return NextResponse.json(
      { error: `Conversation too long (max ${MAX_TOTAL_USER_CHARS} characters of user text)` },
      { status: 400 },
    );
  }

  const conversationId = parsed.data.conversationId ?? randomUUID();
  const db = getDb();
  const kv = getKv();

  await getOrCreateConversation(db, { id: conversationId, channel: "chat" });
  const unlocked = await isConversationUnlocked(kv, conversationId);

  const publicKbText = await getPublicKbText();
  const sensitiveKbText = unlocked ? await maybeGetSensitiveKbText() : "";

  // Append the last user turn to the transcript before streaming.
  const lastMessage = parsed.data.messages[parsed.data.messages.length - 1];
  if (lastMessage.role === "user") {
    const text = lastMessage.parts.map((p) => p.text).join("");
    await appendTurn(db, conversationId, {
      role: "user",
      text,
      at: new Date().toISOString(),
    });
  }

  const result = await answer({
    messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
    kbText: publicKbText,
    sensitiveKbText: sensitiveKbText || undefined,
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-conversation-id": conversationId },
    onFinish: async ({ messages: finalMessages }) => {
      // After the stream completes, append the assistant's full reply.
      const last = finalMessages[finalMessages.length - 1];
      if (last && last.role === "assistant") {
        const text = last.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        await appendTurn(db, conversationId, {
          role: "assistant",
          text,
          at: new Date().toISOString(),
        });
      }
    },
  });
}
```

- [ ] **Step 2: Extend `tests/app/api/chat/route.test.ts`**

The existing 4 validation tests still pass. Add one for the new `conversationId` field:

```typescript
it("rejects a malformed conversationId", async () => {
  const res = await POST(makeReq({
    conversationId: "not-a-uuid",
    messages: [{ id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
  }));
  expect(res.status).toBe(400);
});
```

Note: this test only verifies validation. The happy path (DB write, sensitive include, etc.) is integration territory — manual smoke test in dev.

- [ ] **Step 3: Run tests + typecheck**

```bash
pnpm test tests/app/api/chat/
pnpm typecheck
```

Expected: 5/5 chat route tests, typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts tests/app/api/chat/route.test.ts
git commit -m "feat(chat): conversation-id, transcript logging, sensitive-KB inclusion"
```

---

## Task 17: `/api/identify/request` route

**Files:**
- Create: `app/api/identify/request/route.ts`
- Create: `tests/app/api/identify/request/route.test.ts`

The route validates input, applies rate limits (5/hour per IP, 3/hour per email), calls `requestIdentification`, and returns 200 with `{ ok: true }` or 400 on validation failure.

- [ ] **Step 1: Write validation test**

`tests/app/api/identify/request/route.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/identify/request/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/identify/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/identify/request POST validation", () => {
  it("rejects an empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects a free-email work_email", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      name: "X", company: "Y", workEmail: "x@gmail.com", role: "Recruiter",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/free-?email|domain/i);
  });

  it("rejects malformed conversationId", async () => {
    const res = await POST(makeReq({
      conversationId: "not-a-uuid",
      name: "X", company: "Y", workEmail: "x@acme.com", role: "Recruiter",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
pnpm test tests/app/api/identify/request/route.test.ts
```

- [ ] **Step 3: Implement the route**

`app/api/identify/request/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIdentification } from "@/lib/identity/service";
import { isLikelyWorkEmail } from "@/lib/identity/email-domain";
import { sendVerificationCode } from "@/lib/identity/resend";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  workEmail: z.string().email(),
  role: z.string().min(1).max(120),
  purpose: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  if (!isLikelyWorkEmail(parsed.data.workEmail)) {
    return NextResponse.json(
      { error: "Please use a work email — free-email providers (gmail, outlook, etc.) are not accepted" },
      { status: 400 },
    );
  }

  const kv = getKv();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ipLimit = await checkRateLimit(kv, { key: `identify-req:ip:${ip}`, limit: 5, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many identification requests from your IP" }, { status: 429 });
  }
  const emailLimit = await checkRateLimit(kv, { key: `identify-req:email:${parsed.data.workEmail.toLowerCase()}`, limit: 3, windowSeconds: 3600 });
  if (!emailLimit.allowed) {
    return NextResponse.json({ error: "Too many code requests for this email" }, { status: 429 });
  }

  const db = getDb();
  const result = await requestIdentification(
    { db, kv, send: sendVerificationCode },
    parsed.data,
  );

  if (!result.ok) {
    return NextResponse.json({ error: "Invalid email domain" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — expect PASS for validation tests**

```bash
pnpm test tests/app/api/identify/request/route.test.ts
```

Some tests will exercise rate-limit code paths that touch `getKv()` which requires env. In tests, the env vars are absent. The current `getKv()` throws — these tests would fail at runtime. Fix by setting test env at the top of the test file:

```typescript
beforeAll(() => {
  process.env.KV_REST_API_URL = "http://test";
  process.env.KV_REST_API_TOKEN = "test";
});
```

…BUT the @upstash/redis client will then try to actually make HTTP requests. For test isolation, dependency-inject `kv` is cleaner. For v2, accept this limitation: keep the test focused on validation that fails BEFORE reaching `getKv()`. The "free-email" test exits before getKv (good), and the "missing fields" / "invalid uuid" tests exit before getKv too (good). Only happy-path requests reach getKv — and we don't test the happy path here.

Confirm by reading the route: validation errors return BEFORE `getKv()`. All four tests hit only validation errors. They should pass without env setup.

If they still fail because of getKv side-effects, restructure the route so rate limiting happens AFTER full validation — which is already how it's written.

- [ ] **Step 5: Commit**

```bash
git add app/api/identify/request/route.ts tests/app/api/identify/request/route.test.ts
git commit -m "feat(api): /api/identify/request route (validates + rate-limits + sends code)"
```

---

## Task 18: `/api/identify/verify` route

**Files:**
- Create: `app/api/identify/verify/route.ts`
- Create: `tests/app/api/identify/verify/route.test.ts`

- [ ] **Step 1: Write validation test**

`tests/app/api/identify/verify/route.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/identify/verify/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/identify/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/identify/verify POST validation", () => {
  it("rejects empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing fields", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric code", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      workEmail: "x@acme.com",
      code: "abcdef",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects code of wrong length", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      workEmail: "x@acme.com",
      code: "12345",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test tests/app/api/identify/verify/route.test.ts
```

- [ ] **Step 3: Implement**

`app/api/identify/verify/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { verifyIdentification } from "@/lib/identity/service";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid(),
  workEmail: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  const kv = getKv();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = await checkRateLimit(kv, { key: `identify-verify:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many verification attempts" }, { status: 429 });
  }

  const db = getDb();
  const result = await verifyIdentification({ db, kv }, parsed.data);
  if (!result.ok) {
    if (result.reason === "code_invalid") {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }
    return NextResponse.json({ error: "Asker not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, token: result.token, askerId: result.askerId });
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test tests/app/api/identify/verify/route.test.ts
```

Same logic as Task 17 Step 4: validation errors return before getKv. Should pass without env setup.

- [ ] **Step 5: Commit**

```bash
git add app/api/identify/verify/route.ts tests/app/api/identify/verify/route.test.ts
git commit -m "feat(api): /api/identify/verify route (validates + verifies code + issues token)"
```

---

## Task 19: `/api/forward-question` route

**Files:**
- Create: `app/api/forward-question/route.ts`
- Create: `tests/app/api/forward-question/route.test.ts`

- [ ] **Step 1: Write validation test**

`tests/app/api/forward-question/route.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/forward-question/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/forward-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/forward-question POST validation", () => {
  it("rejects empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing question", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "x".repeat(2001),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test tests/app/api/forward-question/route.test.ts
```

- [ ] **Step 3: Implement**

`app/api/forward-question/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { forwardQuestion } from "@/lib/questions/repo";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  const kv = getKv();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = await checkRateLimit(kv, { key: `forward:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many forwarded questions" }, { status: 429 });
  }

  const db = getDb();
  const row = await forwardQuestion(db, parsed.data);
  return NextResponse.json({ ok: true, id: row.id });
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test tests/app/api/forward-question/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/forward-question/route.ts tests/app/api/forward-question/route.test.ts
git commit -m "feat(api): /api/forward-question route"
```

---

## Task 20: Identify modal component

A two-step modal: form (name, company, workEmail, role, optional purpose) → submit → "Code sent" + code entry → submit → success or error.

**Files:**
- Create: `components/identify-modal.tsx`

No unit tests — interactive UI tested manually in dev. (Plan 1's chat-message tests cover the rendering primitives; this modal is composed of standard inputs.)

- [ ] **Step 1: Implement the modal**

`components/identify-modal.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type IdentifyModalProps = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
};

type Step = "form" | "code" | "submitting";

export function IdentifyModal({ conversationId, open, onClose, onSuccess }: IdentifyModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState("");
  const [purpose, setPurpose] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("submitting");
    const res = await fetch("/api/identify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, name, company, workEmail, role, purpose: purpose || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      setError(body.error ?? "Request failed");
      setStep("form");
      return;
    }
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("submitting");
    const res = await fetch("/api/identify/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, workEmail, code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Verification failed");
      setStep("code");
      return;
    }
    onSuccess(body.token);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--color-background)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "form" || step === "submitting" ? (
          <form className="flex flex-col gap-3" onSubmit={submitForm}>
            <h2 className="text-base font-semibold">Identify yourself</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Sensitive details (salary, references, private contact) are visible after verifying your work email. This is logged — please use your real identity.
            </p>
            <Field label="Name" value={name} onChange={setName} required />
            <Field label="Company" value={company} onChange={setCompany} required />
            <Field label="Work email" value={workEmail} onChange={setWorkEmail} type="email" required />
            <Field label="Role" value={role} onChange={setRole} required placeholder="Recruiter, Hiring Manager, …" />
            <label className="flex flex-col gap-1 text-xs">
              <span>Purpose (optional)</span>
              <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} />
            </label>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={step === "submitting"}>Cancel</Button>
              <Button type="submit" disabled={step === "submitting"}>
                {step === "submitting" ? "Sending…" : "Send code"}
              </Button>
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submitCode}>
            <h2 className="text-base font-semibold">Enter the 6-digit code</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              We sent a code to <strong>{workEmail}</strong>. It's valid for 10 minutes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className={cn(
                "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)]",
                "p-3 text-center text-2xl tracking-[0.5em] font-mono",
              )}
              placeholder="000000"
            />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button type="submit" disabled={code.length !== 6}>Verify</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span>{label}{required && <span className="text-red-600"> *</span>}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      />
    </label>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add components/identify-modal.tsx
git commit -m "feat(ui): identify modal (form → email code → verify)"
```

---

## Task 21: Render `[[identify]]` and `[[forward:...]]` markers in chat messages

**Files:**
- Modify: `components/chat-message.tsx`
- Modify: `components/chat.tsx`
- Modify: `tests/components/chat-message.test.tsx`

The renderer detects markers in assistant messages and emits clickable elements that call callbacks. The chat shell handles the callbacks (opens modal, posts forward-question).

- [ ] **Step 1: Update `components/chat-message.tsx`**

Add two callbacks to props (`onIdentify`, `onForward`). When the renderer finds `[[identify]]` it emits a button that triggers `onIdentify`. When it finds `[[forward:<text>]]` it emits a button that triggers `onForward(text)`. Citation rewriting still runs first; marker replacement is a second pass on the same text.

Replace the file with:
```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { parseCitations, citationToUrl } from "@/lib/kb/citations";
import { cn } from "@/lib/utils";

export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  repoUrl: string;
  branch: string;
  onIdentify?: () => void;
  onForward?: (question: string) => void;
};

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sup", "span"],
  attributes: {
    ...defaultSchema.attributes,
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), ["target"], ["rel"]],
    span: [...((defaultSchema.attributes?.span as unknown[]) ?? []), ["dataMarker"]],
  },
};

function rewriteCitations(text: string, repoUrl: string, branch: string): string {
  const cites = parseCitations(text);
  let i = 0;
  let out = text;
  for (const c of cites) {
    i += 1;
    const url = citationToUrl(c, { repoUrl, branch });
    const replacement = `<sup>[\\[${i}\\]](${url})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}

function splitOnMarkers(text: string): Array<{ kind: "text"; value: string } | { kind: "identify" } | { kind: "forward"; question: string }> {
  const out: Array<{ kind: "text"; value: string } | { kind: "identify" } | { kind: "forward"; question: string }> = [];
  const re = /\[\[(identify|forward:[^\]]+)\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
    if (m[1] === "identify") {
      out.push({ kind: "identify" });
    } else {
      out.push({ kind: "forward", question: m[1].slice("forward:".length).trim() });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

export function ChatMessage({ role, text, repoUrl, branch, onIdentify, onForward }: ChatMessageProps) {
  const isAssistant = role === "assistant";

  if (!isAssistant) {
    return (
      <div className={bubbleClass(false)}>
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  const withCitations = rewriteCitations(text, repoUrl, branch);
  const chunks = splitOnMarkers(withCitations);

  return (
    <div className={bubbleClass(true)}>
      {chunks.map((c, i) => {
        if (c.kind === "text") {
          return (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>
                ),
              }}
            >
              {c.value}
            </ReactMarkdown>
          );
        }
        if (c.kind === "identify") {
          return (
            <button
              key={i}
              type="button"
              onClick={onIdentify}
              className="mt-2 mr-2 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-1 text-xs underline-offset-2 hover:underline"
            >
              Identify yourself
            </button>
          );
        }
        // forward
        return (
          <button
            key={i}
            type="button"
            onClick={() => onForward?.(c.question)}
            className="mt-2 mr-2 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-1 text-xs underline-offset-2 hover:underline"
          >
            Send this question to Alexandre
          </button>
        );
      })}
    </div>
  );
}

function bubbleClass(isAssistant: boolean) {
  return cn(
    "max-w-prose rounded-2xl px-4 py-3 text-sm leading-relaxed",
    isAssistant
      ? "self-start bg-[var(--color-muted)] text-[var(--color-foreground)]"
      : "self-end bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
  );
}
```

- [ ] **Step 2: Extend tests (`tests/components/chat-message.test.tsx`)**

Add:
```tsx
it("renders an 'Identify yourself' button for [[identify]] marker and triggers callback", async () => {
  const onIdentify = vi.fn();
  const user = userEvent.setup();
  render(
    <ChatMessage
      role="assistant"
      text="That's behind verification. [[identify]]"
      repoUrl={REPO}
      branch={BRANCH}
      onIdentify={onIdentify}
    />,
  );
  const btn = screen.getByRole("button", { name: /identify yourself/i });
  await user.click(btn);
  expect(onIdentify).toHaveBeenCalled();
});

it("renders 'Send this question to Alexandre' for [[forward:...]] and passes the question to the callback", async () => {
  const onForward = vi.fn();
  const user = userEvent.setup();
  render(
    <ChatMessage
      role="assistant"
      text="Not in the KB — [[forward:What were Q1 numbers?]]"
      repoUrl={REPO}
      branch={BRANCH}
      onForward={onForward}
    />,
  );
  const btn = screen.getByRole("button", { name: /send this question/i });
  await user.click(btn);
  expect(onForward).toHaveBeenCalledWith("What were Q1 numbers?");
});
```

Update imports at top of file:
```tsx
import { vi } from "vitest";
import userEvent from "@testing-library/user-event";
```

- [ ] **Step 3: Update `components/chat.tsx` to wire callbacks**

In the existing `Chat` component:
- Generate / persist a `conversationId` via `localStorage`.
- Add modal state.
- Pass `conversationId` in `sendMessage` (or via transport body).
- Pass `onIdentify` / `onForward` to `ChatMessage`.

Make targeted edits. Open `components/chat.tsx`. Add imports + state:

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat-message";
import { IdentifyModal } from "@/components/identify-modal";
import { cn } from "@/lib/utils";

export type ChatProps = {
  repoUrl: string;
  branch: string;
  intro: string;
  placeholder: string;
  sendLabel: string;
  startersTitle: string;
  starters: string[];
};

function loadOrCreateConversationId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "queryme:conversationId";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function Chat({ repoUrl, branch, intro, placeholder, sendLabel, startersTitle, starters }: ChatProps) {
  const [conversationId, setConversationId] = useState("");
  useEffect(() => { setConversationId(loadOrCreateConversationId()); }, []);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ conversationId }),
    }),
    [conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const isBusy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function messageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  async function handleForward(question: string) {
    try {
      const res = await fetch("/api/forward-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, question }),
      });
      if (res.ok) setForwardToast("Question forwarded to Alexandre.");
      else setForwardToast("Couldn't forward — try again.");
    } catch {
      setForwardToast("Couldn't forward — try again.");
    }
    setTimeout(() => setForwardToast(null), 3000);
  }

  return (
    <section className="flex h-[70vh] max-w-3xl flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <ChatMessage role="assistant" text={intro} repoUrl={repoUrl} branch={branch} />
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role === "user" ? "user" : "assistant"}
            text={messageText(m)}
            repoUrl={repoUrl}
            branch={branch}
            onIdentify={() => setModalOpen(true)}
            onForward={handleForward}
          />
        ))}

        {messages.length === 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{startersTitle}</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]",
                    "px-3 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
                  )}
                  onClick={() => submit(s)}
                  disabled={isBusy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Something went wrong — please try again.
        </div>
      )}

      {forwardToast && (
        <div role="status" className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs">
          {forwardToast}
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="resize-none"
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <Button type="submit" disabled={isBusy || !input.trim()}>{sendLabel}</Button>
      </form>

      <IdentifyModal
        conversationId={conversationId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          // The next chat message will see the unlocked conversation server-side
          // and include sensitive content. No client-side state to mutate.
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm test
pnpm typecheck
```

Expected: all green. The chat-message test file should now have 7 tests (5 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add components/chat-message.tsx components/chat.tsx tests/components/chat-message.test.tsx
git commit -m "feat(ui): render [[identify]] + [[forward]] markers; wire chat to identify modal + forward API"
```

---

## Task 22: Sample sensitive KB content (placeholders)

**Files:**
- Create: `kb/sensitive/salary.yaml`
- Create: `kb/sensitive/references.yaml`
- Create: `kb/sensitive/private-contact.yaml`

These are placeholders for Alexandre to fill in. Sample shape so the validation script passes and the agent has structurally-valid content to summarize once unlocked.

- [ ] **Step 1: Write `kb/sensitive/salary.yaml`**

```yaml
expectations: "[Compensation expectations — to be filled in. e.g. '€100k–€140k base, equity for early-stage; €130k–€170k for established Series-A+']"
history:
  - company: "[Most recent company name]"
    period: "2022-03"
    amount: "[Amount or 'founder equity / no salary']"
    notes: "[Context, e.g. founder, currency]"
```

- [ ] **Step 2: Write `kb/sensitive/references.yaml`**

```yaml
entries:
  - name: "[Reference name — to be filled in]"
    relationship: "[Relationship — e.g. 'CEO at X, 2020-2022']"
    email: "[reference@example.com]"
    notes: "[Best to contact them via LinkedIn first / async-friendly]"
```

- [ ] **Step 3: Write `kb/sensitive/private-contact.yaml`**

```yaml
phone: "[+33 6 XX XX XX XX]"
personalEmail: "[alex@personal-domain.example]"
notes: "Best reached via signal / async; please introduce yourself first via the work email"
```

- [ ] **Step 4: Validate**

```bash
pnpm validate:kb
```

Expected: `OK — KB validates and assembles to <N> chars.` The validation script doesn't read sensitive content (it only assembles public), so this confirms the new schemas haven't broken anything. To smoke-test the sensitive load specifically, run a tsx one-liner:

```bash
pnpm exec tsx -e "import('./lib/kb/loader.js').then(async ({ loadKb }) => { const kb = await loadKb('./kb'); console.log('sensitive sections:', { salary: !!kb.sensitive.salary, references: !!kb.sensitive.references, privateContact: !!kb.sensitive.privateContact }); })"
```

(If the tsx invocation has issues with the .js extension on a .ts source, change to `import('./lib/kb/loader.ts')` — tsx resolves either.)

- [ ] **Step 5: Commit**

```bash
git add kb/sensitive/
git commit -m "feat(kb): seed sensitive content placeholders"
```

---

## Task 23: Provisioning checklist (Postgres + KV + Resend + env)

This task has no code changes. It's the operational sequence for getting Plan 2 actually running in production. Run through the steps and check them off; commit nothing.

- [ ] **Step 1: Provision a Postgres database**

In the Vercel dashboard for `shanoirs-projects/queryme`:
- Storage → Create Database → Neon (or Vercel Postgres).
- Connect to the project. Vercel injects `POSTGRES_URL` and related env vars automatically.

Locally:
```bash
vercel env pull .env.local
```

This downloads the connection string into `.env.local` so the dev server and migration script can use it.

- [ ] **Step 2: Run the initial migration**

```bash
pnpm db:migrate
```

Expected: `Running migrations…` then `OK.` — three tables created (`askers`, `conversations`, `questions_for_alex`).

Sanity check by querying via `psql` or Neon's web SQL console:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

Should list the three tables.

- [ ] **Step 3: Provision Vercel KV (Upstash Redis)**

Storage → Create Database → KV. Connect to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

Re-pull env:
```bash
vercel env pull .env.local
```

- [ ] **Step 4: Set up Resend**

- Create a Resend account at https://resend.com if not already.
- Verify a domain (e.g., `mail.collet.dev`) under Resend → Domains. Until verified, you can only send to your own email via Resend's `onboarding@resend.dev` sender.
- Create an API key under Resend → API Keys.
- Add the key + sender to Vercel env:

```bash
cd /Users/alexandrecollet/queryme
vercel env add RESEND_API_KEY production --value "re_XXX" --yes
vercel env add RESEND_API_KEY preview "" --value "re_XXX" --yes
vercel env add RESEND_FROM_EMAIL production --value "verify@mail.collet.dev" --yes
vercel env add RESEND_FROM_EMAIL preview "" --value "verify@mail.collet.dev" --yes
vercel env add APP_NAME production --value "Queryme" --yes --no-sensitive
vercel env add APP_NAME preview "" --value "Queryme" --yes --no-sensitive
vercel env add APP_PUBLIC_URL production --value "https://queryme-three.vercel.app" --yes --no-sensitive
vercel env add APP_PUBLIC_URL preview "" --value "https://queryme-three.vercel.app" --yes --no-sensitive
```

Add the same to `.env.local` for local dev.

- [ ] **Step 5: Re-pull all envs and verify**

```bash
vercel env pull .env.local
pnpm typecheck && pnpm test && pnpm build
```

All three must pass. The build's `validate:kb` step will run; sensitive content loads but isn't required by validation.

- [ ] **Step 6: Manual local smoke**

```bash
pnpm dev
```

Open http://localhost:3000. Confirm:
- Chat works (loads cleanly without 500s).
- Ask: "What's his salary expectation?" — agent should respond and emit `[[identify]]`; the chat shows an "Identify yourself" button.
- Click the button; fill the form with your real email (or a work-domain email Resend allows); submit.
- Check inbox for the code; enter it; modal closes.
- Re-ask the salary question — answer should now include the sensitive content (with citation to `sensitive/salary.yaml`).
- Try "Send this question to Alexandre" via the [[forward]] flow on a question the KB can't answer.
- Verify rows landed in Postgres: `SELECT * FROM askers; SELECT * FROM conversations; SELECT * FROM questions_for_alex;`.

- [ ] **Step 7: Production smoke test**

After provisioning is done, push (or wait for the auto-deploy from the last commit). Then run the same smoke on https://queryme-three.vercel.app.

---

## Task 24: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "What's NOT in this version" section**

Find this block in `README.md`:
```markdown
## What's NOT in this version

This is the foundation. Coming in later releases:

- Sensitive content (salary, references, private contact) behind verified-email identification
- Lead capture + admin panel
- MCP server endpoint for AI agents
```

Replace with:
```markdown
## What's in this version

- Public chat at `/` answering questions about Alexandre, grounded in `kb/`.
- Sensitive content (salary, references, private contact) gated behind verified work-email identification.
- "Ask Alexandre" inline button when the agent hits a knowledge gap.
- Conversation logging + identified-asker capture in Postgres for follow-up.

## What's NOT in this version

Coming in later plans:

- MCP server endpoint for AI agents (Plan 3)
- Admin panel for reviewing conversations + forwarded questions (Plan 4)
```

- [ ] **Step 2: Add a "Provisioning" subsection under "Local development"**

After the existing "Local development" section, insert:
```markdown
## Provisioning (one time)

Plan 2 needs Postgres (via Vercel/Neon), Upstash Redis (via Vercel KV), and a Resend account.

1. Vercel dashboard → Storage → Create Database → Neon. Connect to the project.
2. Vercel dashboard → Storage → Create Database → KV. Connect to the project.
3. Resend → verify a domain → create an API key.
4. Pull all envs locally: `vercel env pull .env.local`
5. Run migrations: `pnpm db:migrate`

After this, `pnpm dev` will work end-to-end.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for Plan 2 (sensitive content + identification)"
```

---

## Final verification

- [ ] **Step 1: Full pipeline**

```bash
pnpm typecheck && pnpm test && pnpm build
```

All three must pass. Test count should be around 60 (42 from Plan 1 + ~18 new).

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

Vercel auto-deploys. Watch the deploy in the Vercel dashboard; the build step runs `validate:kb` first and will fail loudly if any KB file is malformed.

- [ ] **Step 3: Production smoke test**

Run through Task 23 Step 7 against the live URL.

---

## Notes for the engineer running this plan

- **Drizzle's neon-http driver** is HTTP-based — works in serverless (no connection pooling needed). If you ever switch to long-lived servers (e.g., a custom Node host), swap to `drizzle-orm/postgres-js` with `pg` and add a connection pool.
- **The conversations table grows unbounded.** v2 doesn't add cleanup; for moderate traffic this is fine for the first year. Plan 4 (admin) should add an archive/delete UI.
- **Rate limits are per-IP via `x-forwarded-for`** — works on Vercel; in other environments you may need to read a different header. Don't worry about it for v2.
- **The conversation ID lives in localStorage** — clearing browser data drops the unlock. That matches the 24h TTL design and is documented behavior.
- **Sensitive content is not cached at the LLM provider level** — small cost on every unlocked-conversation request. If sensitive content grows large enough to matter, add a second `cacheControl: ephemeral` breakpoint on the sensitive message in `lib/answerer.ts`.
- **The agent decides when to emit `[[identify]]` and `[[forward]]`** based on the system prompt. If the model misuses or skips them, refine the prompt — don't add brittle keyword-detection logic in the route.
- **Plan 3 (MCP) will wrap `requestIdentification`, `verifyIdentification`, `answer`, `forwardQuestion`** — all defined in `lib/*` and importable. The HTTP routes are thin wrappers around these; MCP tools will be parallel thin wrappers.
- **Plan 4 (admin) will read from the same Postgres tables**. The `questionsForAlex` table already has a `answeredAt` column for the "mark as answered" UI.

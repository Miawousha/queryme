# Stripe Billing (Free + Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monetize queritae with a Free plan (10 answered questions/month, forward-only past the limit) and a $9/month Pro plan via Stripe Checkout + Customer Portal + webhooks.

**Architecture:** Stripe is the source of truth; the DB caches plan state (`accounts.plan` + new `account_billing` table) written by the webhook and a checkout-success sync. Enforcement reuses `checkQuota`, which now resolves per-plan numbers internally (`quotaConfigForPlan`), adding a `plan_allowance` verdict that the chat route turns into forward-only mode and the MCP `ask` tool turns into a forward-pointing error.

**Tech Stack:** Next.js App Router (nodejs runtime), Drizzle/Postgres (Neon), `stripe` npm SDK, Resend email, vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-stripe-billing-design.md`

**Conventions used throughout** (match these exactly):
- DB tests that need a real database are gated: `const d = process.env.RUN_DB_TESTS ? describe : describe.skip` (see `tests/lib/usage/repo.test.ts`).
- Handlers take injected deps objects (see `AskDeps` in `lib/mcp/tools.ts`).
- Run tests with `pnpm vitest run <path>`; full suite `pnpm test`; types `pnpm typecheck`.
- `STRIPE_SECRET_KEY` (test mode) is already in `.env.local`.

---

### Task 1: Dependency + environment scaffolding

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `.env.example`

- [ ] **Step 1: Install the Stripe SDK**

```bash
pnpm add stripe
```

- [ ] **Step 2: Add env documentation**

Append to `.env.example` after the `# --- Quotas & spend alerting ---` block:

```bash
# --- Billing (Stripe) ---

# Secret key (test mode: sk_test_..., live: sk_live_... or a restricted key).
STRIPE_SECRET_KEY=

# Signing secret for /api/stripe/webhook. From `stripe listen` locally, or the
# dashboard webhook endpoint config in production.
STRIPE_WEBHOOK_SECRET=

# The recurring $9/month Price for the Pro plan. Printed by `pnpm stripe:setup`.
STRIPE_PRO_PRICE_ID=
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(billing): add stripe sdk and env scaffolding"
```

---

### Task 2: Schema — `accounts.plan` + `account_billing`

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0013_*.sql` (generated)

- [ ] **Step 1: Add the plan enum and column to `accounts`**

In `lib/db/schema.ts`, below the `ACCOUNT_STATUSES` block, add:

```ts
/**
 * Billing plans. `free` is the default for every account; `pro` is set only by
 * billing code deriving it from the Stripe subscription status — never by hand.
 */
export const ACCOUNT_PLANS = ["free", "pro"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];
```

Inside the `accounts` table definition, after the `status` column, add:

```ts
    plan: text("plan", { enum: ACCOUNT_PLANS }).notNull().default("free"),
```

- [ ] **Step 2: Add the `account_billing` table**

At the end of `lib/db/schema.ts`, add:

```ts
/**
 * Stripe state cache plus billing-adjacent account state, one row per account.
 * Stripe fields are written only by billing code (webhook + checkout sync);
 * `lastNudgeMonth` is claimed from the allowance check when the upgrade-nudge
 * email sends, so a row may exist for a never-subscribed free account. Stripe
 * is the source of truth — this table is derived from it.
 */
export const accountBilling = pgTable(
  "account_billing",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"), // raw Stripe status
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    lastNudgeMonth: text("last_nudge_month"), // "YYYY-MM", UTC
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("account_billing_account_unique").on(table.accountId),
    customerUnique: uniqueIndex("account_billing_customer_unique")
      .on(table.stripeCustomerId)
      .where(sql`stripe_customer_id IS NOT NULL`),
  }),
);

export type AccountBilling = typeof accountBilling.$inferSelect;
```

- [ ] **Step 3: Generate and apply the migration**

```bash
pnpm db:generate
ls lib/db/migrations | tail -2   # expect a new 0013_*.sql
pnpm db:migrate                  # applies against POSTGRES_URL from .env.local
```

Open the generated SQL and confirm it only adds the `plan` column (default `'free'`, not null) and creates `account_billing`.

- [ ] **Step 4: Typecheck, run the full suite, commit**

```bash
pnpm typecheck && pnpm test
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(billing): accounts.plan and account_billing schema"
```

---

### Task 3: `getUsageTotals` gains `monthMessages`

**Files:**
- Modify: `lib/usage/repo.ts:60-82`
- Modify: `tests/lib/usage/repo.test.ts`
- Modify: `tests/lib/usage/quota.test.ts:6` (mock shape)

- [ ] **Step 1: Extend the integration test**

In `tests/lib/usage/repo.test.ts`, inside the existing `d("usage/repo (integration)")` block's totals assertion, add `monthMessages` to the expected object (it equals the number of `recordUsage` calls made in the test). Example shape change:

```ts
expect(totals).toEqual({ dayMessages: 2, monthMessages: 2, monthTokens: 30 });
```

(Adapt the numbers to the existing test's recorded calls — keep its arrange section unchanged.)

- [ ] **Step 2: Implement**

In `lib/usage/repo.ts`, change `UsageTotals` and the query:

```ts
export type UsageTotals = {
  /** Messages across all channels today (UTC). */
  dayMessages: number;
  /** Messages across all channels this UTC calendar month. */
  monthMessages: number;
  /** input + output tokens across all channels this UTC calendar month. */
  monthTokens: number;
};
```

In the `select({...})` inside `getUsageTotals`, add:

```ts
      monthMessages: sql<number>`coalesce(sum(${accountUsage.messages}), 0)::int`,
```

and in the return statement add `monthMessages: row?.monthMessages ?? 0,`.

- [ ] **Step 3: Fix the quota test's repo mock**

In `tests/lib/usage/quota.test.ts:6`, the mock must satisfy the new type:

```ts
  getUsageTotals: vi.fn(async () => ({ dayMessages: 0, monthMessages: 0, monthTokens: 0 })),
```

(Some tests later override the mock's resolved value — add `monthMessages: 0` to each override too.)

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm vitest run tests/lib/usage/
git add lib/usage/repo.ts tests/lib/usage/
git commit -m "feat(billing): month-level message count in usage totals"
```

(If `RUN_DB_TESTS` is unset the integration block skips — that's expected; typecheck still validates the shape.)

---

### Task 4: Plan derivation — `lib/billing/plan.ts`

**Files:**
- Create: `lib/billing/plan.ts`
- Create: `tests/lib/billing/plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  planFromSubscriptionStatus,
  subscriptionPeriodEnd,
  subscriptionCustomerId,
  FREE_MONTHLY_ANSWERS,
} from "@/lib/billing/plan";

describe("planFromSubscriptionStatus", () => {
  it("maps paying-or-grace statuses to pro", () => {
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("trialing")).toBe("pro");
    // past_due keeps Pro through Stripe's smart-retry window: a recruiter
    // conversation must not die because a card expired yesterday.
    expect(planFromSubscriptionStatus("past_due")).toBe("pro");
  });

  it("maps terminal or unpaid statuses to free", () => {
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus("unpaid")).toBe("free");
    expect(planFromSubscriptionStatus("incomplete")).toBe("free");
    expect(planFromSubscriptionStatus("incomplete_expired")).toBe("free");
  });

  it("fails closed on null/undefined/garbage", () => {
    expect(planFromSubscriptionStatus(null)).toBe("free");
    expect(planFromSubscriptionStatus(undefined)).toBe("free");
    expect(planFromSubscriptionStatus("definitely_not_a_status")).toBe("free");
  });
});

describe("subscriptionPeriodEnd", () => {
  it("prefers the item-level period end (Stripe API 2025+), epoch seconds → Date", () => {
    const sub = { items: { data: [{ current_period_end: 1_780_000_000 }] } };
    expect(subscriptionPeriodEnd(sub)?.toISOString()).toBe(
      new Date(1_780_000_000 * 1000).toISOString(),
    );
  });

  it("falls back to the subscription-level field (older API versions)", () => {
    expect(subscriptionPeriodEnd({ current_period_end: 1_780_000_000 })).toEqual(
      new Date(1_780_000_000 * 1000),
    );
  });

  it("returns null when absent", () => {
    expect(subscriptionPeriodEnd({})).toBeNull();
  });
});

describe("subscriptionCustomerId", () => {
  it("handles string and expanded-object customers", () => {
    expect(subscriptionCustomerId({ customer: "cus_123" })).toBe("cus_123");
    expect(subscriptionCustomerId({ customer: { id: "cus_456" } })).toBe("cus_456");
  });
});

describe("FREE_MONTHLY_ANSWERS", () => {
  it("is the spec'd allowance", () => {
    expect(FREE_MONTHLY_ANSWERS).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/billing/plan.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/plan`.

- [ ] **Step 3: Implement `lib/billing/plan.ts`**

```ts
import type { AccountPlan } from "@/lib/db/schema";

/** Free plan: answered questions per UTC calendar month, chat + MCP combined. */
export const FREE_MONTHLY_ANSWERS = 10;

/**
 * Stripe subscription statuses that count as paying. `past_due` stays Pro
 * through Stripe's ~2-week smart-retry window so a stale card never cuts off
 * a recruiter mid-conversation; terminal states downgrade.
 */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Derive the account plan from a raw Stripe subscription status. Fails closed to free. */
export function planFromSubscriptionStatus(status: string | null | undefined): AccountPlan {
  return status && PRO_STATUSES.has(status) ? "pro" : "free";
}

/**
 * Structural view of a Stripe subscription, covering both pre- and post-2025
 * API shapes (current_period_end moved from the subscription to its items in
 * the 2025-03-31 "Basil" version) without pinning this module to either.
 */
export type SubscriptionLike = {
  id?: string;
  status?: string;
  customer?: string | { id: string };
  metadata?: Record<string, string> | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> | null } | null;
};

/** The subscription's current period end as a Date, or null when unreported. */
export function subscriptionPeriodEnd(sub: SubscriptionLike): Date | null {
  const epoch = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
  return typeof epoch === "number" ? new Date(epoch * 1000) : null;
}

/** The customer id whether Stripe returned it as a string or expanded object. */
export function subscriptionCustomerId(sub: SubscriptionLike): string | null {
  if (typeof sub.customer === "string") return sub.customer;
  return sub.customer?.id ?? null;
}
```

- [ ] **Step 4: Run to verify it passes, commit**

```bash
pnpm vitest run tests/lib/billing/plan.test.ts
git add lib/billing/plan.ts tests/lib/billing/plan.test.ts
git commit -m "feat(billing): plan derivation from stripe subscription status"
```

---

### Task 5: Quota — per-plan config and `plan_allowance` verdict

**Files:**
- Modify: `lib/usage/quota.ts`
- Modify: `tests/lib/usage/quota.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/usage/quota.test.ts` (the file already mocks `@/lib/usage/repo`; also mock the accounts repo at the top, next to the existing mock):

```ts
vi.mock("@/lib/accounts/repo", () => ({
  getAccountById: vi.fn(async () => ({ plan: "free" })),
}));
```

```ts
import { quotaConfigForPlan } from "@/lib/usage/quota";
import { getAccountById } from "@/lib/accounts/repo";

describe("quotaConfigForPlan", () => {
  it("free adds the 10-answer monthly allowance on top of platform ceilings", () => {
    withEnv({ [DAILY]: undefined, [MONTHLY]: undefined }, () => {
      expect(quotaConfigForPlan("free")).toEqual({
        dailyMessages: 200,
        monthlyTokens: 10_000_000,
        monthlyMessages: 10,
      });
    });
  });

  it("pro is the platform ceilings unchanged (no monthlyMessages cap)", () => {
    withEnv({ [DAILY]: undefined, [MONTHLY]: undefined }, () => {
      expect(quotaConfigForPlan("pro")).toEqual({ dailyMessages: 200, monthlyTokens: 10_000_000 });
    });
  });
});

describe("checkQuota plan allowance", () => {
  const db = {} as never;
  const accountId = "00000000-0000-4000-8000-000000000001";

  it("refuses with plan_allowance when monthly messages hit the free cap", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 3,
      monthMessages: 10,
      monthTokens: 100,
    });
    const verdict = await checkQuota(db, accountId, {
      dailyMessages: 200,
      monthlyTokens: 10_000_000,
      monthlyMessages: 10,
    });
    expect(verdict).toEqual({ allowed: false, reason: "plan_allowance" });
  });

  it("resolves the plan config itself when no explicit config is passed", async () => {
    // getAccountById mock returns { plan: "free" } → allowance 10 applies.
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 0,
      monthMessages: 10,
      monthTokens: 0,
    });
    const verdict = await checkQuota(db, accountId);
    expect(verdict).toEqual({ allowed: false, reason: "plan_allowance" });
  });

  it("allows a free account under its allowance", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 0,
      monthMessages: 9,
      monthTokens: 0,
    });
    const verdict = await checkQuota(db, accountId, {
      dailyMessages: 200,
      monthlyTokens: 10_000_000,
      monthlyMessages: 10,
    });
    expect(verdict).toEqual({ allowed: true });
  });
});
```

Note: the existing `checkQuota` tests pass explicit configs without `monthlyMessages` — they must keep passing unchanged (optional field).

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run tests/lib/usage/quota.test.ts`
Expected: FAIL — `quotaConfigForPlan` not exported; `plan_allowance` never returned.

- [ ] **Step 3: Implement in `lib/usage/quota.ts`**

Add imports at the top:

```ts
import { getAccountById } from "@/lib/accounts/repo";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import type { AccountPlan } from "@/lib/db/schema";
```

Extend `QuotaConfig` and the verdict union:

```ts
export type QuotaConfig = {
  /** Max messages (paid model calls) per account per UTC day. */
  dailyMessages: number;
  /** Max input+output tokens per account per UTC calendar month. */
  monthlyTokens: number;
  /**
   * Plan allowance: max answered questions per UTC calendar month. Set for
   * free accounts; omitted means no per-plan cap (pro).
   */
  monthlyMessages?: number;
};

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily_messages" | "monthly_tokens" | "plan_allowance" };
```

Add after `quotaConfig()`:

```ts
/** The quota numbers for a billing plan: free adds the monthly answer allowance. */
export function quotaConfigForPlan(plan: AccountPlan): QuotaConfig {
  const base = quotaConfig();
  return plan === "free" ? { ...base, monthlyMessages: FREE_MONTHLY_ANSWERS } : base;
}
```

Change `checkQuota` so the default config is plan-aware (callers stay untouched — the plan lookup is one PK select, negligible next to the model call it gates):

```ts
export async function checkQuota(
  db: Db,
  accountId: string,
  config?: QuotaConfig,
  now: Date = new Date(),
): Promise<QuotaVerdict> {
  const cfg =
    config ?? quotaConfigForPlan((await getAccountById(db, accountId))?.plan ?? "free");
  const totals = await getUsageTotals(db, accountId, now);
  // Plan allowance first: it is the limit a visitor can actually hit in normal
  // use, and the chat handler keys its forward-only response off this reason.
  if (cfg.monthlyMessages !== undefined && totals.monthMessages >= cfg.monthlyMessages) {
    return { allowed: false, reason: "plan_allowance" };
  }
  if (totals.dayMessages >= cfg.dailyMessages) {
    return { allowed: false, reason: "daily_messages" };
  }
  if (totals.monthTokens >= cfg.monthlyTokens) {
    return { allowed: false, reason: "monthly_tokens" };
  }
  return { allowed: true };
}
```

Also update the docstring above `QuotaConfig` ("Phase 5 (billing) turns these into per-plan numbers" — that phase is now this code; reword to describe the plan-aware behavior).

- [ ] **Step 4: Run the full suite, commit**

```bash
pnpm typecheck && pnpm test
git add lib/usage/quota.ts tests/lib/usage/quota.test.ts
git commit -m "feat(billing): plan-aware quota with plan_allowance verdict"
```

If other tests fail on the widened verdict or totals shape, fix their mocks the same way as Step 1 of Task 3.

---

### Task 6: Billing repo — `lib/billing/repo.ts`

**Files:**
- Create: `lib/billing/repo.ts`
- Create: `tests/lib/billing/repo.test.ts`

- [ ] **Step 1: Write the (DB-gated) failing test**

`tests/lib/billing/repo.test.ts` — same pattern as `tests/lib/usage/repo.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, accountBilling } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  applySubscriptionState,
  getBillingForAccount,
  findAccountIdByCustomer,
  setStripeCustomer,
  claimNudge,
} from "@/lib/billing/repo";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("billing/repo (integration)", () => {
  const db = getDb();
  const username = `test-billing-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(accountBilling).where(eq(accountBilling.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("applySubscriptionState upserts billing and flips accounts.plan", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    await applySubscriptionState(db, {
      accountId,
      stripeCustomerId: "cus_test_1",
      stripeSubscriptionId: "sub_test_1",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date("2026-07-11T00:00:00Z"),
    });

    const billing = await getBillingForAccount(db, accountId);
    expect(billing?.stripeCustomerId).toBe("cus_test_1");
    expect(billing?.subscriptionStatus).toBe("active");
    const [acctRow] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acctRow.plan).toBe("pro");

    // Re-applying a terminal status downgrades (idempotent upsert, same row).
    await applySubscriptionState(db, {
      accountId,
      stripeCustomerId: "cus_test_1",
      stripeSubscriptionId: "sub_test_1",
      subscriptionStatus: "canceled",
      currentPeriodEnd: null,
    });
    const [after] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(after.plan).toBe("free");
  });

  it("findAccountIdByCustomer resolves the mapping", async () => {
    expect(await findAccountIdByCustomer(db, "cus_test_1")).toBe(accountId);
    expect(await findAccountIdByCustomer(db, "cus_nope")).toBeNull();
  });

  it("setStripeCustomer survives an existing row", async () => {
    await setStripeCustomer(db, accountId, "cus_test_2");
    expect((await getBillingForAccount(db, accountId))?.stripeCustomerId).toBe("cus_test_2");
  });

  it("claimNudge claims once per month", async () => {
    expect(await claimNudge(db, accountId, "2026-06")).toBe(true);
    expect(await claimNudge(db, accountId, "2026-06")).toBe(false); // already claimed
    expect(await claimNudge(db, accountId, "2026-07")).toBe(true); // new month
  });
});
```

- [ ] **Step 2: Run to verify it fails to import**

Run: `pnpm vitest run tests/lib/billing/repo.test.ts`
Expected: FAIL (module not found) — or all-skip without `RUN_DB_TESTS`; typecheck is the gate then.

- [ ] **Step 3: Implement `lib/billing/repo.ts`**

```ts
import { and, eq, sql } from "drizzle-orm";
import { accounts, accountBilling, type AccountBilling } from "@/lib/db/schema";
import { planFromSubscriptionStatus } from "@/lib/billing/plan";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type SubscriptionState = {
  accountId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
};

/**
 * Persist a subscription snapshot and derive `accounts.plan` from it. Pure
 * upsert keyed on accountId: duplicate or out-of-order webhook deliveries
 * converge on the same row. Two statements, no transaction (the Neon HTTP
 * driver has none) — both writes are idempotent and re-derivable from Stripe.
 */
export async function applySubscriptionState(db: Db, state: SubscriptionState): Promise<void> {
  await db
    .insert(accountBilling)
    .values({
      accountId: state.accountId,
      stripeCustomerId: state.stripeCustomerId,
      stripeSubscriptionId: state.stripeSubscriptionId,
      subscriptionStatus: state.subscriptionStatus,
      currentPeriodEnd: state.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: accountBilling.accountId,
      set: {
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        subscriptionStatus: state.subscriptionStatus,
        currentPeriodEnd: state.currentPeriodEnd,
        updatedAt: sql`now()`,
      },
    });
  await db
    .update(accounts)
    .set({ plan: planFromSubscriptionStatus(state.subscriptionStatus) })
    .where(eq(accounts.id, state.accountId));
}

export async function getBillingForAccount(
  db: Db,
  accountId: string,
): Promise<AccountBilling | null> {
  const [row] = await db
    .select()
    .from(accountBilling)
    .where(eq(accountBilling.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/** Reverse lookup for webhook events that only carry a customer id. */
export async function findAccountIdByCustomer(
  db: Db,
  stripeCustomerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ accountId: accountBilling.accountId })
    .from(accountBilling)
    .where(eq(accountBilling.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row?.accountId ?? null;
}

/** Record the Stripe customer for an account before its first checkout completes. */
export async function setStripeCustomer(
  db: Db,
  accountId: string,
  stripeCustomerId: string,
): Promise<void> {
  await db
    .insert(accountBilling)
    .values({ accountId, stripeCustomerId })
    .onConflictDoUpdate({
      target: accountBilling.accountId,
      set: { stripeCustomerId, updatedAt: sql`now()` },
    });
}

/**
 * Atomically claim the right to send this month's upgrade-nudge email.
 * Returns true exactly once per (account, month) across concurrent callers:
 * the insert wins for a first-ever nudge; otherwise the conditional update
 * wins only when the stored month differs.
 */
export async function claimNudge(db: Db, accountId: string, month: string): Promise<boolean> {
  const inserted = await db
    .insert(accountBilling)
    .values({ accountId, lastNudgeMonth: month })
    .onConflictDoNothing({ target: accountBilling.accountId })
    .returning({ id: accountBilling.id });
  if (inserted.length > 0) return true;

  const updated = await db
    .update(accountBilling)
    .set({ lastNudgeMonth: month, updatedAt: sql`now()` })
    .where(
      and(
        eq(accountBilling.accountId, accountId),
        sql`${accountBilling.lastNudgeMonth} is distinct from ${month}`,
      ),
    )
    .returning({ id: accountBilling.id });
  return updated.length > 0;
}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm vitest run tests/lib/billing/
# If you have a dev database configured and want the real round-trip:
RUN_DB_TESTS=1 pnpm vitest run tests/lib/billing/repo.test.ts
git add lib/billing/repo.ts tests/lib/billing/repo.test.ts
git commit -m "feat(billing): account_billing repo with idempotent subscription upsert"
```

---

### Task 7: Stripe client + one-shot setup script

**Files:**
- Create: `lib/billing/stripe.ts`
- Create: `scripts/stripe-setup.ts`
- Modify: `package.json` (script entry)

- [ ] **Step 1: Implement `lib/billing/stripe.ts`**

```ts
import Stripe from "stripe";

/**
 * Lazily constructed Stripe client. Reads the key at call time (not import
 * time) so tests and builds that never touch billing don't need it set.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}
```

- [ ] **Step 2: Implement `scripts/stripe-setup.ts`**

Idempotent, non-interactive, JSON to stdout (the queritae CLI convention — these scripts are mostly operated by agents):

```ts
/**
 * One-shot Stripe bootstrap: ensures the "Queritae Pro" product and its
 * $9/month USD price exist, keyed by the price lookup_key so reruns are
 * no-ops. Prints JSON with the ids to wire into env.
 *
 * Usage: pnpm stripe:setup   (reads STRIPE_SECRET_KEY from .env.local)
 */
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: ".env.local" });

const LOOKUP_KEY = "queritae_pro_monthly";
const PRODUCT_NAME = "Queritae Pro";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY is not set" }));
    process.exit(1);
  }
  const stripe = new Stripe(key);

  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(
      JSON.stringify({
        ok: true,
        created: false,
        productId: typeof price.product === "string" ? price.product : price.product.id,
        priceId: price.id,
        env: { STRIPE_PRO_PRICE_ID: price.id },
      }),
    );
    return;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    metadata: { app: "queritae", plan: "pro" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 900,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: LOOKUP_KEY,
  });
  console.log(
    JSON.stringify({
      ok: true,
      created: true,
      productId: product.id,
      priceId: price.id,
      env: { STRIPE_PRO_PRICE_ID: price.id },
    }),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
```

Check whether `dotenv` is already a dependency (`grep dotenv package.json`); the other scripts run via `tsx` — mirror however `scripts/migrate.ts` loads env (it must read `POSTGRES_URL`), and use the same mechanism instead of `dotenv` if it differs.

- [ ] **Step 3: Add the script entry**

In `package.json` scripts, after `"db:migrate"`:

```json
    "stripe:setup": "tsx scripts/stripe-setup.ts",
```

- [ ] **Step 4: Run it for real (test mode) and record the price id**

```bash
pnpm stripe:setup
```

Expected: `{"ok":true,"created":true,"productId":"prod_...","priceId":"price_...", ...}`.
Append to `.env.local`: `STRIPE_PRO_PRICE_ID=<priceId>`.
Run again to confirm idempotency: expect `"created":false` with the same id.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add lib/billing/stripe.ts scripts/stripe-setup.ts package.json
git commit -m "feat(billing): stripe client and idempotent product/price bootstrap"
```

---

### Task 8: Webhook handler + route

**Files:**
- Create: `lib/billing/webhook.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `tests/lib/billing/webhook.test.ts`

- [ ] **Step 1: Write the failing test**

Stripe's `generateTestHeaderString` signs arbitrary payloads, so signature verification is exercised for real — no mocking of the crypto:

```ts
import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
import { handleStripeWebhook, type WebhookDeps } from "@/lib/billing/webhook";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy_key_never_used_for_network");

function signedRequest(event: object): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, signature };
}

function makeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db: {} as never,
    constructEvent: (payload, sig) => stripe.webhooks.constructEvent(payload, sig, SECRET),
    retrieveSubscription: vi.fn(async () => ({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      items: { data: [{ current_period_end: 1_780_000_000 }] },
    })),
    applySubscriptionState: vi.fn(async () => {}),
    findAccountIdByCustomer: vi.fn(async () => null),
    ...overrides,
  };
}

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

describe("handleStripeWebhook", () => {
  it("rejects a missing or invalid signature with 400", async () => {
    const deps = makeDeps();
    expect((await handleStripeWebhook(deps, "{}", null)).status).toBe(400);
    expect((await handleStripeWebhook(deps, "{}", "t=1,v1=bogus")).status).toBe(400);
    expect(deps.applySubscriptionState).not.toHaveBeenCalled();
  });

  it("checkout.session.completed retrieves the subscription and applies state", async () => {
    const deps = makeDeps();
    const { payload, signature } = signedRequest({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          mode: "subscription",
          client_reference_id: ACCOUNT_ID,
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(deps.db, {
      accountId: ACCOUNT_ID,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(1_780_000_000 * 1000),
    });
  });

  it("subscription.updated resolves the account from metadata", async () => {
    const deps = makeDeps();
    const { payload, signature } = signedRequest({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          customer: "cus_1",
          metadata: { accountId: ACCOUNT_ID },
          items: { data: [{ current_period_end: 1_780_000_000 }] },
        },
      },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ accountId: ACCOUNT_ID, subscriptionStatus: "past_due" }),
    );
  });

  it("subscription.deleted falls back to the customer-id lookup", async () => {
    const deps = makeDeps({ findAccountIdByCustomer: vi.fn(async () => ACCOUNT_ID) });
    const { payload, signature } = signedRequest({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", status: "canceled", customer: "cus_1" } },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.findAccountIdByCustomer).toHaveBeenCalledWith(deps.db, "cus_1");
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ accountId: ACCOUNT_ID, subscriptionStatus: "canceled" }),
    );
  });

  it("acknowledges unmapped accounts and unknown event types without applying", async () => {
    const deps = makeDeps(); // findAccountIdByCustomer → null
    const sub = signedRequest({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_x", status: "active", customer: "cus_unknown" } },
    });
    expect((await handleStripeWebhook(deps, sub.payload, sub.signature)).status).toBe(200);

    const other = signedRequest({ id: "evt_5", type: "invoice.paid", data: { object: {} } });
    expect((await handleStripeWebhook(deps, other.payload, other.signature)).status).toBe(200);
    expect(deps.applySubscriptionState).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/billing/webhook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/billing/webhook.ts`**

```ts
import type Stripe from "stripe";
import {
  subscriptionCustomerId,
  subscriptionPeriodEnd,
  type SubscriptionLike,
} from "@/lib/billing/plan";
import type { applySubscriptionState, findAccountIdByCustomer } from "@/lib/billing/repo";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type WebhookDeps = {
  db: Db;
  /** stripe.webhooks.constructEvent bound to the endpoint secret. Throws on bad signature. */
  constructEvent: (payload: string, signature: string) => Stripe.Event;
  retrieveSubscription: (id: string) => Promise<SubscriptionLike>;
  applySubscriptionState: typeof applySubscriptionState;
  findAccountIdByCustomer: typeof findAccountIdByCustomer;
};

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

/** Minimal structural view of a checkout session event payload. */
type CheckoutSessionLike = {
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
};

async function applyFromSubscription(
  deps: WebhookDeps,
  sub: SubscriptionLike,
  accountId: string,
): Promise<void> {
  const customerId = subscriptionCustomerId(sub);
  if (!customerId || !sub.id || !sub.status) return;
  await deps.applySubscriptionState(deps.db, {
    accountId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: subscriptionPeriodEnd(sub),
  });
}

/**
 * Verify and apply one Stripe webhook delivery. Every handled event derives
 * the same state (status → plan) via an idempotent upsert, so duplicates and
 * out-of-order deliveries converge. Unknown events and unmappable accounts
 * are acknowledged with 200 — Stripe must not retry them forever.
 */
export async function handleStripeWebhook(
  deps: WebhookDeps,
  payload: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  if (!signature) return { status: 400, body: { error: "missing stripe-signature" } };

  let event: Stripe.Event;
  try {
    event = deps.constructEvent(payload, signature);
  } catch {
    return { status: 400, body: { error: "invalid signature" } };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as CheckoutSessionLike;
      const accountId = session.client_reference_id;
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (session.mode !== "subscription" || !accountId || !subId) break;
      const sub = await deps.retrieveSubscription(subId);
      await applyFromSubscription(deps, sub, accountId);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as SubscriptionLike;
      const accountId =
        sub.metadata?.accountId ??
        (subscriptionCustomerId(sub)
          ? await deps.findAccountIdByCustomer(deps.db, subscriptionCustomerId(sub)!)
          : null);
      if (!accountId) {
        console.error("stripe webhook: no account for subscription", sub.id);
        break;
      }
      await applyFromSubscription(deps, sub, accountId);
      break;
    }
    default:
      break; // acknowledged, ignored
  }

  return { status: 200, body: { received: true } };
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `pnpm vitest run tests/lib/billing/webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the route `app/api/stripe/webhook/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getStripe } from "@/lib/billing/stripe";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { applySubscriptionState, findAccountIdByCustomer } from "@/lib/billing/repo";
import type { SubscriptionLike } from "@/lib/billing/plan";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed but loudly: a deployed webhook without its secret is a
    // configuration bug, not a request error.
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }
  const stripe = getStripe();
  const payload = await req.text();
  const outcome = await handleStripeWebhook(
    {
      db: getDb(),
      constructEvent: (p, s) => stripe.webhooks.constructEvent(p, s, secret),
      retrieveSubscription: async (id) =>
        (await stripe.subscriptions.retrieve(id)) as unknown as SubscriptionLike,
      applySubscriptionState,
      findAccountIdByCustomer,
    },
    payload,
    req.headers.get("stripe-signature"),
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}
```

- [ ] **Step 6: Typecheck, full test run, commit**

```bash
pnpm typecheck && pnpm test
git add lib/billing/webhook.ts app/api/stripe/webhook/route.ts tests/lib/billing/webhook.test.ts
git commit -m "feat(billing): stripe webhook with signature-verified plan sync"
```

---

### Task 9: Checkout + portal routes, checkout-success sync

**Files:**
- Create: `lib/billing/checkout.ts`
- Create: `app/api/a/[username]/admin/billing/checkout/route.ts`
- Create: `app/api/a/[username]/admin/billing/portal/route.ts`

- [ ] **Step 1: Implement `lib/billing/checkout.ts`**

```ts
import type Stripe from "stripe";
import { subscriptionCustomerId, subscriptionPeriodEnd, type SubscriptionLike } from "@/lib/billing/plan";
import { applySubscriptionState, getBillingForAccount, setStripeCustomer } from "@/lib/billing/repo";
import type { Account } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

/** Site origin for Stripe redirect URLs. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** The account's Stripe customer, created and persisted on first use. */
export async function getOrCreateStripeCustomer(
  db: Db,
  stripe: Stripe,
  account: Account,
): Promise<string> {
  const billing = await getBillingForAccount(db, account.id);
  if (billing?.stripeCustomerId) return billing.stripeCustomerId;
  const customer = await stripe.customers.create({
    metadata: { accountId: account.id, username: account.username },
  });
  await setStripeCustomer(db, account.id, customer.id);
  return customer.id;
}

/**
 * Apply a just-completed Checkout Session to the DB. Called from the billing
 * settings page when the success redirect carries ?session_id=… — covers the
 * window before the webhook delivery lands. Webhook and this path perform the
 * identical upsert, so ordering between them is irrelevant. Failures are
 * logged, not thrown: the webhook is the authoritative retry path.
 */
export async function syncCheckoutSession(
  db: Db,
  stripe: Stripe,
  accountId: string,
  sessionId: string,
): Promise<void> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (session.client_reference_id !== accountId) return; // not this account's session
    const sub = session.subscription as unknown as SubscriptionLike | string | null;
    if (!sub || typeof sub === "string") return;
    const customerId = subscriptionCustomerId(sub);
    if (!customerId || !sub.id || !sub.status) return;
    await applySubscriptionState(db, {
      accountId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: subscriptionPeriodEnd(sub),
    });
  } catch (err) {
    console.error("billing: checkout sync failed", err);
  }
}
```

- [ ] **Step 2: Implement the checkout route**

`app/api/a/[username]/admin/billing/checkout/route.ts` (auth mirrors the domains admin route):

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getStripe } from "@/lib/billing/stripe";
import { getOrCreateStripeCustomer, siteUrl } from "@/lib/billing/checkout";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) return NextResponse.json({ error: "billing_not_configured" }, { status: 500 });

  const db = getDb();
  const stripe = getStripe();
  const customer = await getOrCreateStripeCustomer(db, stripe, res.account);
  const base = `${siteUrl()}/${res.account.username}/admin/settings/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: res.account.id,
    // Stamped onto the subscription so webhook events map back to the account
    // without a customer-id lookup.
    subscription_data: { metadata: { accountId: res.account.id } },
    success_url: `${base}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: base,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 3: Implement the portal route**

`app/api/a/[username]/admin/billing/portal/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getStripe } from "@/lib/billing/stripe";
import { getBillingForAccount } from "@/lib/billing/repo";
import { siteUrl } from "@/lib/billing/checkout";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const billing = await getBillingForAccount(getDb(), res.account.id);
  if (!billing?.stripeCustomerId) {
    return NextResponse.json({ error: "no_billing_account" }, { status: 400 });
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${siteUrl()}/${res.account.username}/admin/settings/billing`,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm typecheck && pnpm test
git add lib/billing/checkout.ts "app/api/a/[username]/admin/billing"
git commit -m "feat(billing): checkout, portal, and success-sync plumbing"
```

---

### Task 10: Upgrade-nudge email

**Files:**
- Create: `lib/notify/owner-email.ts` (extracted from the forward route)
- Modify: `app/api/a/[username]/forward-question/route.ts:16-27` (use the extraction)
- Modify: `lib/notify/email.ts` (new composer)
- Create: `lib/billing/nudge.ts`
- Create: `tests/lib/billing/nudge.test.ts`
- Test (composer): `tests/lib/notify/email.test.ts` (existing file — add cases)

- [ ] **Step 1: Extract the owner-address resolver**

Create `lib/notify/owner-email.ts` with the body of `notifyToFor` from `app/api/a/[username]/forward-question/route.ts:16-27`, renamed:

```ts
import { getPersonaStore } from "@/lib/persona/store";
import { getCachedKb } from "@/lib/kb/cache";

/**
 * Where notifications for an account's owner go: the persona's public-contact
 * email, falling back to the platform-wide env address when the persona has no
 * email (or isn't configured / fails to load) so a notification is never
 * silently dropped on a configuration gap.
 */
export async function ownerNotifyAddress(accountId: string): Promise<string> {
  const fallback = process.env.FORWARD_NOTIFICATION_TO ?? "";
  try {
    const store = getPersonaStore();
    await store.ensureReady(accountId);
    if (!store.getRoot(accountId)) return fallback;
    const kb = await getCachedKb(accountId);
    return kb.publicContact.email ?? fallback;
  } catch {
    return fallback;
  }
}
```

In the forward-question route, delete the local `notifyToFor` and its now-unused imports, import `ownerNotifyAddress`, and change the call site to `notifyTo: await ownerNotifyAddress(account.id)`.

- [ ] **Step 2: Write the failing composer test**

Add to `tests/lib/notify/email.test.ts` (match the file's existing fake-transport pattern; if it defines one, reuse it):

```ts
import { sendUpgradeNudge } from "@/lib/notify/email";

describe("sendUpgradeNudge", () => {
  it("sends the upgrade email with the billing link", async () => {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      send: async (msg) => {
        sent.push(msg);
        return { id: "email-1" };
      },
    };
    const result = await sendUpgradeNudge(transport, {
      to: "owner@example.com",
      from: "noreply@queritae.com",
      username: "alex",
      freeAllowance: 10,
      billingUrl: "https://queritae.com/alex/admin/settings/billing",
    });
    expect(result).toEqual({ ok: true, id: "email-1" });
    expect(sent[0].subject).toContain("free questions");
    expect(sent[0].text).toContain("https://queritae.com/alex/admin/settings/billing");
    expect(sent[0].text).toContain("10");
  });
});
```

Run: `pnpm vitest run tests/lib/notify/email.test.ts` — expected FAIL (no export).

- [ ] **Step 3: Implement the composer in `lib/notify/email.ts`**

Append, following the existing composer style:

```ts
export type UpgradeNudge = {
  to: string;
  from: string;
  username: string;
  freeAllowance: number;
  billingUrl: string;
};

export async function sendUpgradeNudge(
  transport: EmailTransport,
  input: UpgradeNudge,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = [
    `Your queritae persona has answered all ${input.freeAllowance} of this month's free questions — and a visitor just asked another one.`,
    ``,
    `Until you upgrade, new visitors are offered the forward-a-question flow instead of live answers (you'll still receive their questions by email).`,
    ``,
    `Upgrade to Pro to keep the conversation going:`,
    input.billingUrl,
  ];
  const subject = `[queritae] your free questions for this month are used up`;
  try {
    const r = await transport.send({
      to: input.to,
      from: input.from,
      subject,
      text: lines.join("\n"),
    });
    return { ok: true, id: r.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

Run: `pnpm vitest run tests/lib/notify/email.test.ts` — expected PASS.

- [ ] **Step 4: Write the failing nudge-orchestrator test**

`tests/lib/billing/nudge.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { maybeSendUpgradeNudge, type NudgeDeps } from "@/lib/billing/nudge";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

function makeDeps(overrides: Partial<NudgeDeps> = {}): NudgeDeps {
  return {
    db: {} as never,
    claimNudge: vi.fn(async () => true),
    getAccountById: vi.fn(async () => ({ id: ACCOUNT_ID, username: "alex" }) as never),
    ownerNotifyAddress: vi.fn(async () => "owner@example.com"),
    transport: { send: vi.fn(async () => ({ id: "email-1" })) },
    from: "noreply@queritae.com",
    siteUrl: "https://queritae.com",
    ...overrides,
  };
}

describe("maybeSendUpgradeNudge", () => {
  it("sends once when the month is claimed", async () => {
    const deps = makeDeps();
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date("2026-06-11T12:00:00Z"));
    expect(deps.claimNudge).toHaveBeenCalledWith(deps.db, ACCOUNT_ID, "2026-06");
    expect(deps.transport.send).toHaveBeenCalledOnce();
    const msg = vi.mocked(deps.transport.send).mock.calls[0][0];
    expect(msg.to).toBe("owner@example.com");
    expect(msg.text).toContain("https://queritae.com/alex/admin/settings/billing");
  });

  it("does nothing when the month was already claimed", async () => {
    const deps = makeDeps({ claimNudge: vi.fn(async () => false) });
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date());
    expect(deps.transport.send).not.toHaveBeenCalled();
  });

  it("does nothing when there is no recipient address", async () => {
    const deps = makeDeps({ ownerNotifyAddress: vi.fn(async () => "") });
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date());
    expect(deps.transport.send).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run tests/lib/billing/nudge.test.ts` — expected FAIL.

- [ ] **Step 5: Implement `lib/billing/nudge.ts`**

```ts
import { claimNudge } from "@/lib/billing/repo";
import { getAccountById } from "@/lib/accounts/repo";
import { ownerNotifyAddress } from "@/lib/notify/owner-email";
import { sendUpgradeNudge, resendTransport, type EmailTransport } from "@/lib/notify/email";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import { siteUrl } from "@/lib/billing/checkout";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type NudgeDeps = {
  db: Db;
  claimNudge: typeof claimNudge;
  getAccountById: typeof getAccountById;
  ownerNotifyAddress: typeof ownerNotifyAddress;
  transport: EmailTransport;
  from: string;
  siteUrl: string;
};

/**
 * Email the owner the first time their free allowance is hit each month.
 * `claimNudge` makes the once-per-month guarantee atomic across concurrent
 * refusals. Never throws — the caller is the chat refusal path and an email
 * failure must not change its response.
 */
export async function maybeSendUpgradeNudge(
  deps: NudgeDeps,
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const month = now.toISOString().slice(0, 7); // "YYYY-MM", UTC
    if (!(await deps.claimNudge(deps.db, accountId, month))) return;
    const account = await deps.getAccountById(deps.db, accountId);
    if (!account) return;
    const to = await deps.ownerNotifyAddress(accountId);
    if (!to) return;
    await sendUpgradeNudge(deps.transport, {
      to,
      from: deps.from,
      username: account.username,
      freeAllowance: FREE_MONTHLY_ANSWERS,
      billingUrl: `${deps.siteUrl}/${account.username}/admin/settings/billing`,
    });
  } catch (err) {
    console.error("billing: upgrade nudge failed", err);
  }
}

/** Production wiring for the chat handler. */
export function nudgeDeps(db: Db): NudgeDeps {
  return {
    db,
    claimNudge,
    getAccountById,
    ownerNotifyAddress,
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
    siteUrl: siteUrl(),
  };
}
```

- [ ] **Step 6: Verify all, commit**

```bash
pnpm typecheck && pnpm test
git add lib/notify/owner-email.ts lib/notify/email.ts lib/billing/nudge.ts \
  "app/api/a/[username]/forward-question/route.ts" tests/lib/billing/nudge.test.ts tests/lib/notify/
git commit -m "feat(billing): once-per-month upgrade nudge email"
```

---

### Task 11: Chat + MCP enforcement responses

**Files:**
- Modify: `lib/chat/handle-chat.ts:121-135`
- Modify: `lib/mcp/tools.ts:87-95`
- Modify: `tests/lib/chat/handle-chat.test.ts`, `tests/lib/mcp/*.test.ts` (as needed)

- [ ] **Step 1: Write/adjust the failing chat-handler test**

In `tests/lib/chat/handle-chat.test.ts`, find how `checkQuota` is faked (module mock). Add a case:

```ts
it("returns 429 with plan_allowance and fires the nudge when the free allowance is hit", async () => {
  vi.mocked(checkQuota).mockResolvedValueOnce({ allowed: false, reason: "plan_allowance" });
  const res = await handleChat(makeRequest(validBody), ACCOUNT_ID);
  expect(res.status).toBe(429);
  const body = await res.json();
  expect(body.reason).toBe("plan_allowance");
  expect(maybeSendUpgradeNudge).toHaveBeenCalled();
});
```

with a module mock added next to the file's existing mocks, and the import for the assertion:

```ts
import { maybeSendUpgradeNudge } from "@/lib/billing/nudge";

vi.mock("@/lib/billing/nudge", () => ({
  maybeSendUpgradeNudge: vi.fn(async () => {}),
  nudgeDeps: vi.fn(() => ({})),
}));
```

(Adapt `makeRequest`/`validBody`/`ACCOUNT_ID` to the file's existing helpers — read the file first and follow its arrange/act style.)

Run: `pnpm vitest run tests/lib/chat/handle-chat.test.ts` — new case FAILS.

- [ ] **Step 2: Implement in `lib/chat/handle-chat.ts`**

Add the import:

```ts
import { maybeSendUpgradeNudge, nudgeDeps } from "@/lib/billing/nudge";
```

Replace the quota refusal block (lines 124-135) with:

```ts
    const quota = await checkQuota(db, accountId);
    if (!quota.allowed) {
      if (quota.reason === "plan_allowance") {
        // First refusal each month emails the owner. Awaited (serverless may
        // not survive the response) but never throws — see maybeSendUpgradeNudge.
        await maybeSendUpgradeNudge(nudgeDeps(db), accountId);
        return NextResponse.json(
          {
            error: "quota_exceeded",
            reason: quota.reason,
            message:
              "This persona has answered all of its free questions this month. Forward your question instead — the owner will reply personally.",
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        {
          error: "quota_exceeded",
          reason: quota.reason,
          message: "This persona has reached its usage limit. Try again later.",
        },
        { status: 429 },
      );
    }
```

- [ ] **Step 3: MCP `ask` message**

In `lib/mcp/tools.ts`, replace the quota throw (lines 90-94) with:

```ts
    if (!quota.allowed) {
      throw new Error(
        quota.reason === "plan_allowance"
          ? "quota_exceeded (plan_allowance): This persona has answered all of its free questions this month. Use the forward_question tool to leave your question — the candidate will reply personally."
          : `quota_exceeded (${quota.reason}): This persona has reached its usage limit. Try again later.`,
      );
    }
```

If `tests/lib/mcp` has an ask-quota test asserting the old message, extend it to cover both branches rather than weakening it.

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm test
git add lib/chat/handle-chat.ts lib/mcp/tools.ts tests/lib/chat/ tests/lib/mcp/
git commit -m "feat(billing): forward-pointing responses at the plan allowance"
```

---

### Task 12: Chat client — forward-only banner

**Files:**
- Modify: `lib/language.ts` (both `en` and `fr` chat-string objects, next to their `forward` groups)
- Modify: `components/chat.tsx` (error block at ~line 350, `submit` at ~line 149)

- [ ] **Step 1: Add the strings**

In `lib/language.ts`, inside the **en** chat strings (adjacent to `genericError`), add — using the same given-name interpolation as `forwardAction`:

```ts
      planLimit: {
        notice: `${enGiven} has answered this month's included questions. Leave yours below — you'll get a personal reply.`,
        questionPlaceholder: "Your question…",
        contactPlaceholder: "Email or LinkedIn (optional)",
        submit: `Send to ${enGiven}`,
      },
```

And in the **fr** strings:

```ts
      planLimit: {
        notice: `${frGiven} a répondu aux questions incluses ce mois-ci. Laissez la vôtre ci-dessous — vous recevrez une réponse personnelle.`,
        questionPlaceholder: "Votre question…",
        contactPlaceholder: "Email ou LinkedIn (facultatif)",
        submit: `Envoyer à ${frGiven}`,
      },
```

(Match the actual interpolation variable names used in the file — `enGiven`/`frGiven` per `lib/language.ts:30,167`.)

- [ ] **Step 2: Detect the plan-allowance error and track the last question**

In `components/chat.tsx`:

After the `useChat` destructure (~line 91), add:

```ts
  // The chat POST 429s with a JSON body carrying reason: "plan_allowance" when
  // the persona's free allowance is spent. The AI SDK surfaces that body as
  // error.message; anything unparseable falls back to the generic banner.
  const planLimited = useMemo(() => {
    if (!error) return false;
    try {
      return (JSON.parse(error.message) as { reason?: string }).reason === "plan_allowance";
    } catch {
      return false;
    }
  }, [error]);
```

In `submit` (~line 149), keep the last question for prefilling the forward form:

```ts
  const lastSentRef = useRef("");
  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    lastSentRef.current = trimmed;
    sendMessage({ text: trimmed });
    setInput("");
  }
```

- [ ] **Step 3: Replace the error banner block**

Replace the existing `{error && (...)}` block (~line 350) with:

```tsx
      {error && planLimited && (
        <PlanLimitNotice
          strings={t.planLimit}
          initialQuestion={lastSentRef.current}
          onForward={handleForward}
        />
      )}

      {error && !planLimited && (
        <div
          role="alert"
          className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {t.genericError}
        </div>
      )}
```

And add the component at module level in the same file (it is chat-specific):

```tsx
function PlanLimitNotice({
  strings,
  initialQuestion,
  onForward,
}: {
  strings: { notice: string; questionPlaceholder: string; contactPlaceholder: string; submit: string };
  initialQuestion: string;
  onForward: (question: string, contact: string) => void;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-3">
      <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
        {strings.notice}
      </p>
      {!sent && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!question.trim()) return;
            onForward(question.trim(), contact);
            setSent(true); // the shared forward toast reports the outcome
          }}
        >
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={strings.questionPlaceholder}
            rows={2}
            className="text-[13px]"
          />
          <div className="flex items-center gap-2">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={strings.contactPlaceholder}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)]"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-[13px] font-medium text-white transition-all hover:brightness-110"
            >
              {strings.submit}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

(Imports: `useState`/`useMemo`/`useRef` are already imported in chat.tsx; `Textarea` already is too — verify and reuse.)

- [ ] **Step 4: Manual verification of the client path**

The AI SDK error-body assumption must be verified once for real: with the dev server running, temporarily set the free allowance to 0 (`checkQuota` returns plan_allowance immediately for a free test account — easiest: set the account's plan to `free` and `UPDATE account_usage`/send 10 messages, or temporarily hardcode `FREE_MONTHLY_ANSWERS = 0`, **reverting before commit**). Ask a question in the persona chat and confirm the banner with the forward form renders (not the generic red error). Submit it and confirm the forward toast + email path. If `error.message` turns out not to carry the JSON body, fix by switching detection to a refetch-free marker: include `"plan_allowance"` as a substring check on `error.message` before falling back.

- [ ] **Step 5: Run component tests, commit**

```bash
pnpm typecheck && pnpm vitest run tests/components/
git add lib/language.ts components/chat.tsx
git commit -m "feat(billing): forward-only banner when the free allowance is spent"
```

---

### Task 13: Billing settings page + panel + nav

**Files:**
- Create: `components/admin/billing-panel.tsx`
- Create: `app/[username]/admin/settings/billing/page.tsx`
- Modify: `components/admin/admin-rail.tsx:37-38`

- [ ] **Step 1: Implement the client panel**

`components/admin/billing-panel.tsx` (study `components/admin/domains-panel.tsx` first and mirror its card/typography conventions where they differ from this sketch):

```tsx
"use client";

import { useState } from "react";

type Props = {
  apiBasePath: string; // `/api/a/{username}/admin`
  plan: "free" | "pro";
  /** Answered questions this UTC month (chat + MCP). */
  usedThisMonth: number;
  /** The free plan's monthly allowance. */
  freeAllowance: number;
  /** ISO date the subscription renews/ends, when known. */
  currentPeriodEnd: string | null;
};

export function BillingPanel({ apiBasePath, plan, usedThisMonth, freeAllowance, currentPeriodEnd }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(endpoint: "checkout" | "portal") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/billing/${endpoint}`, { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error ?? "Something went wrong — try again.");
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-[var(--color-text-primary)]">Billing</h2>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase ${
            plan === "pro"
              ? "border-[rgba(var(--color-accent-rgb),0.5)] bg-[rgba(var(--color-accent-rgb),0.08)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
          }`}
        >
          {plan}
        </span>
      </div>

      {plan === "free" ? (
        <>
          <p className="mt-4 text-[14px] text-[var(--color-text-secondary)]">
            {usedThisMonth} of {freeAllowance} free answers used this month. Past the limit,
            visitors are offered the forward-a-question flow instead of live answers.
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${Math.min(100, (usedThisMonth / freeAllowance) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => go("checkout")}
            className="mt-5 rounded-full bg-[var(--color-primary)] px-5 py-2 text-[14px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            Upgrade to Pro — $9/month
          </button>
        </>
      ) : (
        <>
          <p className="mt-4 text-[14px] text-[var(--color-text-secondary)]">
            Pro is active{currentPeriodEnd ? ` — renews ${new Date(currentPeriodEnd).toLocaleDateString()}` : ""}.
            Unlimited answering within fair-use ceilings, custom domains, MCP.
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
            {usedThisMonth} answered questions this month.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => go("portal")}
            className="mt-5 rounded-full border border-[var(--color-border)] px-5 py-2 text-[14px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            Manage billing
          </button>
        </>
      )}

      {error && <p className="mt-3 text-[13px] text-red-300">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement the page**

`app/[username]/admin/settings/billing/page.tsx` (Next 15: `searchParams` is a Promise):

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { getDb } from "@/lib/db/client";
import { getAccountById } from "@/lib/accounts/repo";
import { getUsageTotals } from "@/lib/usage/repo";
import { getBillingForAccount } from "@/lib/billing/repo";
import { syncCheckoutSession } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import { BillingPanel } from "@/components/admin/billing-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const db = getDb();

  // Checkout just completed: apply the session now instead of waiting for the
  // webhook, so the page never shows "free" to someone who just paid.
  const { session_id: sessionId } = await searchParams;
  if (typeof sessionId === "string" && sessionId.length > 0) {
    await syncCheckoutSession(db, getStripe(), account.id, sessionId);
  }

  // Re-read: the sync above (or a racing webhook) may have flipped the plan.
  const fresh = (await getAccountById(db, account.id)) ?? account;
  const billing = await getBillingForAccount(db, account.id);
  const totals = await getUsageTotals(db, account.id);

  return (
    <BillingPanel
      apiBasePath={`/api/a/${account.username}/admin`}
      plan={fresh.plan}
      usedThisMonth={totals.monthMessages}
      freeAllowance={FREE_MONTHLY_ANSWERS}
      currentPeriodEnd={billing?.currentPeriodEnd?.toISOString() ?? null}
    />
  );
}
```

- [ ] **Step 3: Add the nav entry**

In `components/admin/admin-rail.tsx`, after the Custom domains entry (line 38):

```ts
        { href: `${adminBasePath}/settings/billing`, label: "Billing" },
```

- [ ] **Step 4: Verify in the browser**

With the dev server running (preview), sign in as an account owner, open `/{username}/admin/settings/billing`. Expect the Free panel with the usage meter. (Full checkout E2E happens in Task 15.)

- [ ] **Step 5: Typecheck, tests, commit**

```bash
pnpm typecheck && pnpm test
git add components/admin/billing-panel.tsx "app/[username]/admin/settings/billing" components/admin/admin-rail.tsx
git commit -m "feat(billing): billing settings page with upgrade and portal actions"
```

---

### Task 14: Pro-gate adding custom domains

**Files:**
- Modify: `lib/domains/service.ts` (the `addDomainForAccount` entry + `DomainError` reason union)
- Modify: `tests/lib/domains/service.test.ts` (or the file's actual name under `tests/lib/domains/`)

- [ ] **Step 1: Write the failing test**

In the domains service test file, add (mirroring its existing arrange style — it constructs `Account` objects already; add `plan: "free"`):

```ts
it("refuses to add a domain for a free-plan account", async () => {
  await expect(
    addDomainForAccount(db, { ...account, plan: "free" }, "cv.example.com"),
  ).rejects.toMatchObject({ reason: "pro_required" });
});
```

Run it — expected FAIL (domain gets added or other error).

- [ ] **Step 2: Implement the gate**

In `lib/domains/service.ts`: add `"pro_required"` to the `DomainError` reason union, and at the top of `addDomainForAccount` (it already receives the full `Account`):

```ts
  // Adding domains is Pro-only. Existing active domains keep serving — the
  // gate is on creation, never on traffic, so a downgrade can't break a live URL.
  if (account.plan !== "pro") {
    throw new DomainError("Custom domains require the Pro plan.", "pro_required");
  }
```

The admin domains route already maps `DomainError` → 400 with `{ error, reason }`, and `DomainsPanel` already surfaces the error message — no UI change needed.

- [ ] **Step 3: Fix existing domain tests**

Existing add-domain tests will now fail unless their fixture accounts are `plan: "pro"` — update those fixtures, keeping one explicit `free` refusal case.

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm test
git add lib/domains/service.ts tests/lib/domains/
git commit -m "feat(billing): adding custom domains requires pro"
```

---

### Task 15: End-to-end verification (test mode) + docs

**Files:**
- Modify: `ROADMAP.md` (tick Phase 5 items)
- Modify: `.env.local` (webhook secret from stripe CLI — not committed)

- [ ] **Step 1: Local webhook forwarding**

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
# (install: brew install stripe/stripe-cli/stripe; stripe login pairs with the test account)
```

Copy the printed `whsec_...` into `.env.local` as `STRIPE_WEBHOOK_SECRET`, restart the dev server.

- [ ] **Step 2: Full subscribe flow**

1. Sign in as a test account owner; open `/{username}/admin/settings/billing` → Free panel.
2. Click **Upgrade to Pro** → Stripe Checkout. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
3. Land back on the billing page → expect the **pro** badge (success-sync path) and a `checkout.session.completed` + `customer.subscription.created/updated` in the `stripe listen` output (webhook path).
4. Verify in DB: `accounts.plan = 'pro'`, `account_billing` row populated.

- [ ] **Step 3: Allowance + downgrade flow**

1. **Manage billing** → Stripe portal loads → cancel the subscription (immediately, via the portal's test-mode cancel).
2. Confirm the `customer.subscription.deleted` event flips `accounts.plan` back to `'free'`.
3. With the account on free and 10+ messages recorded this month (insert a row into `account_usage` directly if needed: `messages = 10`, today, channel `chat`), ask a question in the public chat → forward-only banner; submit it → forward toast + notification email; check `account_billing.last_nudge_month` was claimed and the nudge email sent (Resend dashboard or log output).
4. Try adding a custom domain on free → refused with the Pro message.

- [ ] **Step 4: Tick the roadmap**

In `ROADMAP.md` Phase 5, mark the three items `[x]` and note the spec/plan paths.

- [ ] **Step 5: Final sweep and commit**

```bash
pnpm typecheck && pnpm test && pnpm build
git add ROADMAP.md
git commit -m "docs: phase 5 billing shipped (stripe free + pro)"
```

**Production go-live (post-implementation, with the user):** repeat `pnpm stripe:setup` with the live key, create a dashboard webhook endpoint for `https://queritae.com/api/stripe/webhook` (events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`), and set `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRO_PRICE_ID` in Vercel env.

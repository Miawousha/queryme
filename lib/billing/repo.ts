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

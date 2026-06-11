import type Stripe from "stripe";
import {
  subscriptionCustomerId,
  subscriptionPeriodEnd,
  type SubscriptionLike,
} from "@/lib/billing/plan";
import {
  applySubscriptionState,
  getBillingForAccount,
  setStripeCustomer,
} from "@/lib/billing/repo";
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

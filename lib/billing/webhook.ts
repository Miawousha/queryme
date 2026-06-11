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

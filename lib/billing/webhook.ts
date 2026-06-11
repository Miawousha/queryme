import type Stripe from "stripe";
import {
  planFromSubscriptionStatus,
  subscriptionCustomerId,
  subscriptionPeriodEnd,
  type SubscriptionLike,
} from "@/lib/billing/plan";
import type {
  applySubscriptionState,
  findAccountIdByCustomer,
  getBillingForAccount,
} from "@/lib/billing/repo";
import type { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/uuid";

type Db = ReturnType<typeof getDb>;

export type WebhookDeps = {
  db: Db;
  /** stripe.webhooks.constructEvent bound to the endpoint secret. Throws on bad signature. */
  constructEvent: (payload: string, signature: string) => Stripe.Event;
  retrieveSubscription: (id: string) => Promise<SubscriptionLike>;
  applySubscriptionState: typeof applySubscriptionState;
  findAccountIdByCustomer: typeof findAccountIdByCustomer;
  getBillingForAccount: typeof getBillingForAccount;
};

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

/** Minimal structural view of a checkout session event payload. */
type CheckoutSessionLike = {
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
};

/** Postgres `foreign_key_violation` SQLSTATE. */
function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23503"
  );
}

async function applyFromSubscription(
  deps: WebhookDeps,
  sub: SubscriptionLike,
  accountId: string,
): Promise<void> {
  const customerId = subscriptionCustomerId(sub);
  if (!customerId || !sub.id || !sub.status) {
    console.error("stripe webhook: subscription event missing fields", sub.id ?? "(no id)");
    return;
  }
  await deps.applySubscriptionState(deps.db, {
    accountId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: subscriptionPeriodEnd(sub),
  });
}

/**
 * Apply subscription state for a resolved accountId, converting foreign-key
 * violations (no such account row) into a logged 200-ack instead of letting
 * them propagate as 500. Other errors (e.g. DB down) still throw so Stripe
 * retries with backoff.
 */
async function applyOrAckMissingAccount(
  deps: WebhookDeps,
  sub: SubscriptionLike,
  accountId: string,
): Promise<void> {
  try {
    await applyFromSubscription(deps, sub, accountId);
  } catch (err) {
    if (!isForeignKeyViolation(err)) throw err;
    console.error("stripe webhook: account does not exist", accountId);
  }
}

/**
 * Verify and apply one Stripe webhook delivery. Every handled event derives
 * the same state (status → plan) via an idempotent upsert, so duplicates AND
 * reordered deliveries converge: every code path re-fetches current
 * subscription state from Stripe rather than trusting the event payload, so
 * even a stale `updated(active)` arriving after `deleted(canceled)` applies
 * the Stripe-authoritative result.
 *
 * Transient failures (e.g. DB down) throw out of the handler → the route
 * 500s → Stripe retries with backoff.
 *
 * Unknown events and unmappable accounts are acknowledged with 200 —
 * Stripe must not retry them forever.
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
      if (session.mode !== "subscription" || !subId) break;
      // client_reference_id is only trustworthy while all sessions are created
      // server-side; Payment Links would let callers inject it.
      if (!accountId || !isUuid(accountId)) {
        console.error("stripe webhook: invalid account reference", accountId ?? "(none)");
        break;
      }
      const sub = await deps.retrieveSubscription(subId);
      await applyOrAckMissingAccount(deps, sub, accountId);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const evSub = event.data.object as unknown as SubscriptionLike;
      const accountId =
        evSub.metadata?.accountId ??
        (subscriptionCustomerId(evSub)
          ? await deps.findAccountIdByCustomer(deps.db, subscriptionCustomerId(evSub)!)
          : null);
      if (!accountId || !isUuid(accountId)) {
        console.error("stripe webhook: invalid account reference", accountId ?? "(none)");
        break;
      }
      if (!evSub.id) break;
      // Re-fetch instead of trusting the event payload: Stripe does not
      // guarantee delivery order, and a stale `updated` applied after a
      // `deleted` would re-grant pro with no future event to correct it.
      // Canceled subscriptions stay retrievable, so this works for both types.
      const sub = await deps.retrieveSubscription(evSub.id);
      // A free-deriving event may be a delayed retry for a subscription this
      // account has since replaced (cancel → re-subscribe). Only the stored
      // subscription may downgrade; pro-deriving events always apply (a new
      // subscription activating IS the replacement).
      if (planFromSubscriptionStatus(sub.status) === "free") {
        const billing = await deps.getBillingForAccount(deps.db, accountId);
        if (billing?.stripeSubscriptionId && billing.stripeSubscriptionId !== sub.id) {
          console.error("stripe webhook: stale event for replaced subscription", sub.id);
          break;
        }
      }
      await applyOrAckMissingAccount(deps, sub, accountId);
      break;
    }
    default:
      break; // acknowledged, ignored
  }

  return { status: 200, body: { received: true } };
}

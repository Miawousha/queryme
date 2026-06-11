import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getStripe } from "@/lib/billing/stripe";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { applySubscriptionState, findAccountIdByCustomer, getBillingForAccount } from "@/lib/billing/repo";
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
      getBillingForAccount,
    },
    payload,
    req.headers.get("stripe-signature"),
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}

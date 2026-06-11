import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getStripe } from "@/lib/billing/stripe";
import { getOrCreateStripeCustomer, siteUrl } from "@/lib/billing/checkout";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
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

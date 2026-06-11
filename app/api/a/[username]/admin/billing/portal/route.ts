import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getStripe } from "@/lib/billing/stripe";
import { getBillingForAccount } from "@/lib/billing/repo";
import { siteUrl } from "@/lib/billing/checkout";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
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

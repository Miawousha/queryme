import { requireAdminAccount } from "@/lib/admin/require-admin";
import { getDb } from "@/lib/db/client";
import { getAccountById } from "@/lib/accounts/repo";
import { getUsageTotals } from "@/lib/usage/repo";
import { getBillingForAccount } from "@/lib/billing/repo";
import { syncCheckoutSession } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import { PageHeader } from "@/components/admin/page-header";
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
  if (typeof sessionId === "string" && sessionId.length > 0 && process.env.STRIPE_SECRET_KEY) {
    await syncCheckoutSession(db, getStripe(), account.id, sessionId);
  }

  // Re-read: the sync above (or a racing webhook) may have flipped the plan.
  const fresh = (await getAccountById(db, account.id)) ?? account;
  const billing = await getBillingForAccount(db, account.id);
  const totals = await getUsageTotals(db, account.id);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Billing"
        description="Your plan and answers used this month."
      />
      <BillingPanel
        apiBasePath={`/api/a/${account.username}/admin`}
        plan={fresh.plan}
        usedThisMonth={totals.monthMessages}
        freeAllowance={FREE_MONTHLY_ANSWERS}
        currentPeriodEnd={billing?.currentPeriodEnd?.toISOString() ?? null}
      />
    </>
  );
}

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
  return status != null && PRO_STATUSES.has(status) ? "pro" : "free";
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

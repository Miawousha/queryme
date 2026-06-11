import { getUsageTotals } from "@/lib/usage/repo";
import { getAccountById } from "@/lib/accounts/repo";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import type { AccountPlan } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

/**
 * Per-account spend caps. Env vars set platform-wide hard ceilings on paid
 * model calls; `quotaConfigForPlan` layers the per-plan answer allowance on top
 * for free accounts. `checkQuota` is plan-aware when no explicit config is
 * passed — it looks up the account's plan and picks the right config in one PK
 * select that is negligible next to the model call it gates.
 *
 * The values are HARD ceilings — a request over any limit is refused before the
 * Anthropic call, not billed and forgiven.
 */
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

const DEFAULT_DAILY_MESSAGES = 200;
const DEFAULT_MONTHLY_TOKENS = 10_000_000;

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  // A malformed value must not silently lift the cap — fall back to default.
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function quotaConfig(): QuotaConfig {
  return {
    dailyMessages: intEnv("QUOTA_DAILY_MESSAGES_PER_ACCOUNT", DEFAULT_DAILY_MESSAGES),
    monthlyTokens: intEnv("QUOTA_MONTHLY_TOKENS_PER_ACCOUNT", DEFAULT_MONTHLY_TOKENS),
  };
}

/** The quota numbers for a billing plan: free adds the monthly answer allowance. */
export function quotaConfigForPlan(plan: AccountPlan): QuotaConfig {
  const base = quotaConfig();
  return plan === "free" ? { ...base, monthlyMessages: FREE_MONTHLY_ANSWERS } : base;
}

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily_messages" | "monthly_tokens" | "plan_allowance" };

/**
 * Check an account against its quota BEFORE making the paid model call. The
 * check reads committed usage, so the very last request before a boundary can
 * slightly overshoot (by one in-flight call) — acceptable: the ceiling bounds
 * runaway spend, not exact accounting.
 *
 * When no explicit config is passed the function resolves the account's plan
 * from the DB and applies `quotaConfigForPlan` automatically, making every
 * call site automatically plan-aware with no signature change.
 */
export async function checkQuota(
  db: Db,
  accountId: string,
  config?: QuotaConfig,
  now: Date = new Date(),
): Promise<QuotaVerdict> {
  const cfg =
    config ?? quotaConfigForPlan((await getAccountById(db, accountId))?.plan ?? "free");
  const totals = await getUsageTotals(db, accountId, now);
  // Plan allowance first: of the three caps it is the one a visitor can hit in
  // normal use, so callers can key user-facing behavior off this reason without
  // it being shadowed by the platform ceilings.
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

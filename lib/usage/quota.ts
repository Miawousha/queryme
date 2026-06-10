import { getUsageTotals } from "@/lib/usage/repo";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

/**
 * Per-account spend caps. Env-configured platform-wide for now; Phase 5
 * (billing) turns these into per-plan numbers behind the same check.
 *
 * The values are HARD ceilings on paid model calls — a request over either
 * limit is refused before the Anthropic call, not billed and forgiven.
 */
export type QuotaConfig = {
  /** Max messages (paid model calls) per account per UTC day. */
  dailyMessages: number;
  /** Max input+output tokens per account per UTC calendar month. */
  monthlyTokens: number;
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

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily_messages" | "monthly_tokens" };

/**
 * Check an account against its quota BEFORE making the paid model call. The
 * check reads committed usage, so the very last request before a boundary can
 * slightly overshoot (by one in-flight call) — acceptable: the ceiling bounds
 * runaway spend, not exact accounting.
 */
export async function checkQuota(
  db: Db,
  accountId: string,
  config: QuotaConfig = quotaConfig(),
  now: Date = new Date(),
): Promise<QuotaVerdict> {
  const totals = await getUsageTotals(db, accountId, now);
  if (totals.dayMessages >= config.dailyMessages) {
    return { allowed: false, reason: "daily_messages" };
  }
  if (totals.monthTokens >= config.monthlyTokens) {
    return { allowed: false, reason: "monthly_tokens" };
  }
  return { allowed: true };
}

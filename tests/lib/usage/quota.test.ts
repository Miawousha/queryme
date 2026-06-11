import { describe, it, expect, vi } from "vitest";
import { quotaConfig, quotaConfigForPlan, checkQuota } from "@/lib/usage/quota";
import { getUsageTotals } from "@/lib/usage/repo";
import { getAccountById } from "@/lib/accounts/repo";

vi.mock("@/lib/usage/repo", () => ({
  getUsageTotals: vi.fn(async () => ({ dayMessages: 0, monthMessages: 0, monthTokens: 0 })),
}));

vi.mock("@/lib/accounts/repo", () => ({
  getAccountById: vi.fn(async () => ({ plan: "free" })),
}));

/** Run `fn` with env vars temporarily set (undefined = unset), then restore. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const DAILY = "QUOTA_DAILY_MESSAGES_PER_ACCOUNT";
const MONTHLY = "QUOTA_MONTHLY_TOKENS_PER_ACCOUNT";

describe("quotaConfig", () => {
  it("defaults when the env vars are unset", () => {
    withEnv({ [DAILY]: undefined, [MONTHLY]: undefined }, () => {
      expect(quotaConfig()).toEqual({ dailyMessages: 200, monthlyTokens: 10_000_000 });
    });
  });

  it("honours env overrides", () => {
    withEnv({ [DAILY]: "50", [MONTHLY]: "12345" }, () => {
      expect(quotaConfig()).toEqual({ dailyMessages: 50, monthlyTokens: 12_345 });
    });
  });

  it("falls back to defaults on malformed values (never silently lifts the cap)", () => {
    withEnv({ [DAILY]: "not-a-number", [MONTHLY]: "-1" }, () => {
      expect(quotaConfig()).toEqual({ dailyMessages: 200, monthlyTokens: 10_000_000 });
    });
  });

  it("accepts an explicit zero (account fully paused)", () => {
    withEnv({ [DAILY]: "0", [MONTHLY]: undefined }, () => {
      expect(quotaConfig().dailyMessages).toBe(0);
    });
  });
});

describe("checkQuota", () => {
  const db = {} as never;
  const accountId = "00000000-0000-4000-8000-000000000001";
  const config = { dailyMessages: 10, monthlyTokens: 1_000 };

  it("allows an account under both limits", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({ dayMessages: 9, monthMessages: 9, monthTokens: 999 });
    await expect(checkQuota(db, accountId, config)).resolves.toEqual({ allowed: true });
  });

  it("blocks at the daily message cap", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({ dayMessages: 10, monthMessages: 10, monthTokens: 0 });
    await expect(checkQuota(db, accountId, config)).resolves.toEqual({
      allowed: false,
      reason: "daily_messages",
    });
  });

  it("blocks at the monthly token cap", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({ dayMessages: 0, monthMessages: 0, monthTokens: 1_000 });
    await expect(checkQuota(db, accountId, config)).resolves.toEqual({
      allowed: false,
      reason: "monthly_tokens",
    });
  });

  it("reports daily_messages when both caps are exceeded", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({ dayMessages: 99, monthMessages: 99, monthTokens: 9_999 });
    await expect(checkQuota(db, accountId, config)).resolves.toEqual({
      allowed: false,
      reason: "daily_messages",
    });
  });

  it("passes db, accountId and now through to getUsageTotals", async () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    vi.mocked(getUsageTotals).mockClear();
    vi.mocked(getUsageTotals).mockResolvedValueOnce({ dayMessages: 0, monthMessages: 0, monthTokens: 0 });
    await checkQuota(db, accountId, config, now);
    expect(getUsageTotals).toHaveBeenCalledWith(db, accountId, now);
  });
});

describe("quotaConfigForPlan", () => {
  it("free adds the 10-answer monthly allowance on top of platform ceilings", () => {
    withEnv({ [DAILY]: undefined, [MONTHLY]: undefined }, () => {
      expect(quotaConfigForPlan("free")).toEqual({
        dailyMessages: 200,
        monthlyTokens: 10_000_000,
        monthlyMessages: 10,
      });
    });
  });

  it("pro is the platform ceilings unchanged (no monthlyMessages cap)", () => {
    withEnv({ [DAILY]: undefined, [MONTHLY]: undefined }, () => {
      expect(quotaConfigForPlan("pro")).toEqual({ dailyMessages: 200, monthlyTokens: 10_000_000 });
    });
  });
});

describe("checkQuota plan allowance", () => {
  const db = {} as never;
  const accountId = "00000000-0000-4000-8000-000000000001";

  it("refuses with plan_allowance when monthly messages hit the free cap", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 3,
      monthMessages: 10,
      monthTokens: 100,
    });
    const verdict = await checkQuota(db, accountId, {
      dailyMessages: 200,
      monthlyTokens: 10_000_000,
      monthlyMessages: 10,
    });
    expect(verdict).toEqual({ allowed: false, reason: "plan_allowance" });
  });

  it("resolves the plan config itself when no explicit config is passed", async () => {
    // getAccountById mock returns { plan: "free" } → allowance 10 applies.
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 0,
      monthMessages: 10,
      monthTokens: 0,
    });
    const verdict = await checkQuota(db, accountId);
    expect(verdict).toEqual({ allowed: false, reason: "plan_allowance" });
  });

  it("allows a free account under its allowance", async () => {
    vi.mocked(getUsageTotals).mockResolvedValueOnce({
      dayMessages: 0,
      monthMessages: 9,
      monthTokens: 0,
    });
    const verdict = await checkQuota(db, accountId, {
      dailyMessages: 200,
      monthlyTokens: 10_000_000,
      monthlyMessages: 10,
    });
    expect(verdict).toEqual({ allowed: true });
  });
});

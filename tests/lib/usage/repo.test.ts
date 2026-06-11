import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts, accountUsage } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAccount } from "@/lib/accounts/repo";
import { recordUsage, getUsageTotals, utcDay, utcMonthStart } from "@/lib/usage/repo";

// Pure date helpers: quota windows are UTC-anchored, so these must not drift
// with the host timezone.
describe("utcDay", () => {
  it("formats the UTC calendar day", () => {
    expect(utcDay(new Date("2026-06-10T12:34:56.789Z"))).toBe("2026-06-10");
  });

  it("uses UTC, not the local timezone", () => {
    // 23:30 at UTC-5 is already the next day in UTC.
    expect(utcDay(new Date("2026-06-10T23:30:00-05:00"))).toBe("2026-06-11");
  });
});

describe("utcMonthStart", () => {
  it("clamps to the first of the UTC month", () => {
    expect(utcMonthStart(new Date("2026-06-30T23:59:59.999Z"))).toBe("2026-06-01");
    expect(utcMonthStart(new Date("2026-12-01T00:00:00.000Z"))).toBe("2026-12-01");
  });

  it("uses UTC, not the local timezone", () => {
    // 23:30 at UTC-5 on May 31 is June 1 in UTC.
    expect(utcMonthStart(new Date("2026-05-31T23:30:00-05:00"))).toBe("2026-06-01");
  });
});

// Real DB round-trips: opt-in only, so they never hit the developer's live DB.
const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("usage/repo (integration)", () => {
  const db = getDb();
  const username = `test-usage-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(accountUsage).where(eq(accountUsage.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("upserts increments per (account, day, channel) and aggregates totals", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;
    const now = new Date("2026-06-10T12:00:00.000Z");

    await recordUsage(db, { accountId, channel: "chat", inputTokens: 100, outputTokens: 50, now });
    await recordUsage(db, { accountId, channel: "chat", inputTokens: 10, outputTokens: 5, now });
    await recordUsage(db, { accountId, channel: "mcp", inputTokens: 1, outputTokens: 2, now });

    const totals = await getUsageTotals(db, accountId, now);
    // dayMessages spans both channels for the day; monthTokens sums in+out.
    expect(totals.dayMessages).toBe(3);
    expect(totals.monthMessages).toBe(3);
    expect(totals.monthTokens).toBe(168);
  });

  it("counts the message but zeroes non-finite token counts", async () => {
    // Different month, so this assertion is independent of the previous test's rows.
    const now = new Date("2026-07-15T12:00:00.000Z");
    await recordUsage(db, {
      accountId,
      channel: "chat",
      inputTokens: Number.NaN,
      outputTokens: Number.NaN,
      now,
    });

    const totals = await getUsageTotals(db, accountId, now);
    expect(totals.dayMessages).toBe(1);
    expect(totals.monthMessages).toBe(1);
    expect(totals.monthTokens).toBe(0);
  });

  it("returns zeros for an account with no usage", async () => {
    const totals = await getUsageTotals(db, accountId, new Date("2030-01-01T00:00:00.000Z"));
    expect(totals).toEqual({ dayMessages: 0, monthMessages: 0, monthTokens: 0 });
  });
});

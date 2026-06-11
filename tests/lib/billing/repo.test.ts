import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, accountBilling } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  applySubscriptionState,
  getBillingForAccount,
  findAccountIdByCustomer,
  setStripeCustomer,
  claimNudge,
} from "@/lib/billing/repo";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("billing/repo (integration)", () => {
  const db = getDb();
  const username = `test-billing-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(accountBilling).where(eq(accountBilling.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("applySubscriptionState upserts billing and flips accounts.plan", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    await applySubscriptionState(db, {
      accountId,
      stripeCustomerId: "cus_test_1",
      stripeSubscriptionId: "sub_test_1",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date("2026-07-11T00:00:00Z"),
    });

    const billing = await getBillingForAccount(db, accountId);
    expect(billing?.stripeCustomerId).toBe("cus_test_1");
    expect(billing?.subscriptionStatus).toBe("active");
    const [acctRow] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acctRow.plan).toBe("pro");

    // Re-applying a terminal status downgrades (idempotent upsert, same row).
    await applySubscriptionState(db, {
      accountId,
      stripeCustomerId: "cus_test_1",
      stripeSubscriptionId: "sub_test_1",
      subscriptionStatus: "canceled",
      currentPeriodEnd: null,
    });
    const [after] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(after.plan).toBe("free");
  });

  it("findAccountIdByCustomer resolves the mapping", async () => {
    expect(await findAccountIdByCustomer(db, "cus_test_1")).toBe(accountId);
    expect(await findAccountIdByCustomer(db, "cus_nope")).toBeNull();
  });

  it("setStripeCustomer survives an existing row", async () => {
    await setStripeCustomer(db, accountId, "cus_test_2");
    expect((await getBillingForAccount(db, accountId))?.stripeCustomerId).toBe("cus_test_2");
  });

  it("claimNudge claims once per month", async () => {
    expect(await claimNudge(db, accountId, "2026-06")).toBe(true);
    expect(await claimNudge(db, accountId, "2026-06")).toBe(false); // already claimed
    expect(await claimNudge(db, accountId, "2026-07")).toBe(true); // new month
  });
});

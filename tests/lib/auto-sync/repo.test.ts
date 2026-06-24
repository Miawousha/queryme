import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, personaAutoSync } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  getAutoSyncConfig,
  enableAutoSync,
  disableAutoSync,
  touchLastDelivery,
} from "@/lib/auto-sync/repo";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("auto-sync/repo (integration)", () => {
  const db = getDb();
  const username = `test-autosync-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(personaAutoSync).where(eq(personaAutoSync.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("enable creates a row, disable pauses it, re-enable flips it back on", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    expect(await getAutoSyncConfig(accountId)).toBeNull();

    const enabled = await enableAutoSync(accountId);
    expect(enabled.enabled).toBe(true);

    const disabled = await disableAutoSync(accountId);
    expect(disabled?.enabled).toBe(false);

    const reenabled = await enableAutoSync(accountId);
    expect(reenabled.enabled).toBe(true);
    expect(reenabled.id).toBe(enabled.id); // same row, instant re-enable
  });

  it("touchLastDelivery stamps last_delivery_at", async () => {
    await touchLastDelivery(accountId);
    const row = await getAutoSyncConfig(accountId);
    expect(row?.lastDeliveryAt).toBeInstanceOf(Date);
  });
});

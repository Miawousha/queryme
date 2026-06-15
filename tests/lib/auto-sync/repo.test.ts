import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, personaAutoSync } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  generateSecret,
  getAutoSyncConfig,
  enableAutoSync,
  disableAutoSync,
  regenerateSecret,
  touchLastDelivery,
} from "@/lib/auto-sync/repo";

describe("generateSecret", () => {
  it("returns a 64-char hex string", () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
  it("returns a different value each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

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

  it("enable creates a row with a secret, disable keeps the secret", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    expect(await getAutoSyncConfig(accountId)).toBeNull();

    const enabled = await enableAutoSync(accountId);
    expect(enabled.enabled).toBe(true);
    expect(enabled.secret).toMatch(/^[0-9a-f]{64}$/);

    const disabled = await disableAutoSync(accountId);
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.secret).toBe(enabled.secret); // secret retained

    const reenabled = await enableAutoSync(accountId);
    expect(reenabled.enabled).toBe(true);
    expect(reenabled.secret).toBe(enabled.secret); // same secret, instant re-enable
  });

  it("regenerate replaces the secret", async () => {
    const before = await getAutoSyncConfig(accountId);
    const after = await regenerateSecret(accountId);
    expect(after.secret).not.toBe(before?.secret);
  });

  it("touchLastDelivery stamps last_delivery_at", async () => {
    await touchLastDelivery(accountId);
    const row = await getAutoSyncConfig(accountId);
    expect(row?.lastDeliveryAt).toBeInstanceOf(Date);
  });
});

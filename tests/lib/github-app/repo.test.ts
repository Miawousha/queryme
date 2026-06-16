import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, personaAutoSync } from "@/lib/db/schema";
import { createAccount } from "@/lib/accounts/repo";
import {
  findAccountIdByInstallation,
  connectInstallation,
  disconnectInstallation,
} from "@/lib/github-app/repo";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("github-app/repo (integration)", () => {
  const db = getDb();
  const username = `test-ghapp-${Date.now()}`;
  let accountId: string;

  afterAll(async () => {
    if (accountId) {
      await db.delete(personaAutoSync).where(eq(personaAutoSync.accountId, accountId));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it("connect creates a row with installation + secret, find resolves it, disconnect clears it", async () => {
    const acct = await createAccount(db, { username });
    accountId = acct.id;

    expect(await findAccountIdByInstallation("inst-1")).toBeNull();

    await connectInstallation(accountId, "inst-1");
    expect(await findAccountIdByInstallation("inst-1")).toBe(accountId);

    const [row] = await db
      .select()
      .from(personaAutoSync)
      .where(eq(personaAutoSync.accountId, accountId));
    expect(row.enabled).toBe(true);
    expect(row.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(row.installationId).toBe("inst-1");

    // Idempotent re-connect (e.g. existing manual-webhook row) keeps the secret.
    await connectInstallation(accountId, "inst-2");
    expect(await findAccountIdByInstallation("inst-2")).toBe(accountId);
    expect(await findAccountIdByInstallation("inst-1")).toBeNull();

    await disconnectInstallation("inst-2");
    expect(await findAccountIdByInstallation("inst-2")).toBeNull();
  });
});

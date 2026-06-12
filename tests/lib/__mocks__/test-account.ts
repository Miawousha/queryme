/**
 * persona_source.account_id is a uuid FK onto accounts, so DB-integration
 * tests need a real account row to sync against. Idempotent: reuses the row
 * when a previous (crashed) run left it behind.
 */
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const TEST_ACCOUNT_USERNAME = "persona-source-test-account";

export async function ensureTestAccount(): Promise<string> {
  const db = getDb();
  const [created] = await db
    .insert(accounts)
    .values({ username: TEST_ACCOUNT_USERNAME })
    .onConflictDoNothing({ target: accounts.username })
    .returning({ id: accounts.id });
  if (created) return created.id;
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.username, TEST_ACCOUNT_USERNAME));
  return existing.id;
}

/** Callers must delete the account's persona_source rows first (FK). */
export async function deleteTestAccount(): Promise<void> {
  await getDb().delete(accounts).where(eq(accounts.username, TEST_ACCOUNT_USERNAME));
}

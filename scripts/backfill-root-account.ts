import fs from "node:fs";
// Standalone tsx scripts don't auto-load .env.local (Next.js does).
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
import { getDb } from "@/lib/db/client";
import { conversations, personaSource } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
import { getAccountBySlug, createAccount, setAccountRole } from "@/lib/accounts/repo";

/**
 * Associates pre-existing rows (created before multi-tenancy) with the root
 * account, creating the root account from ROOT_ACCOUNT_USERNAME if absent.
 * Idempotent: only rows with a NULL account_id are touched.
 */
async function main(): Promise<void> {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  if (!username) throw new Error("ROOT_ACCOUNT_USERNAME is not set");
  const db = getDb();
  let root = await getAccountBySlug(db, username);
  if (!root) root = await createAccount(db, { username });

  // The house account is the super-admin (operates the /admin console).
  if (root.role !== "admin") {
    root = await setAccountRole(db, root.username, "admin");
  }

  const c = await db
    .update(conversations)
    .set({ accountId: root.id })
    .where(isNull(conversations.accountId))
    .returning({ id: conversations.id });
  const p = await db
    .update(personaSource)
    .set({ accountId: root.id })
    .where(isNull(personaSource.accountId))
    .returning({ id: personaSource.id });

  process.stdout.write(
    `backfilled ${c.length} conversation(s), ${p.length} persona_source row(s) ` +
      `to root account ${root.username} (${root.id})\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });

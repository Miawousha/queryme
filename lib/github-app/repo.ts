import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { personaAutoSync } from "@/lib/db/schema";
import { generateSecret, getAutoSyncConfig } from "@/lib/auto-sync/repo";

/** The account whose auto-sync row owns this GitHub App installation. */
export async function findAccountIdByInstallation(installationId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ accountId: personaAutoSync.accountId })
    .from(personaAutoSync)
    .where(eq(personaAutoSync.installationId, installationId))
    .limit(1);
  return row?.accountId ?? null;
}

/**
 * Bind an installation to an account, enabling auto-sync. Upserts the
 * `persona_auto_sync` row: on first connect it creates the row with a fresh
 * secret (so the not-null column is satisfied and the manual fallback stays
 * usable); on a later connect it sets the new installation id and re-enables,
 * keeping the existing secret. Idempotent.
 */
export async function connectInstallation(accountId: string, installationId: string): Promise<void> {
  const existing = await getAutoSyncConfig(accountId);
  if (existing) {
    await getDb()
      .update(personaAutoSync)
      .set({ installationId, enabled: true, updatedAt: sql`now()` })
      .where(eq(personaAutoSync.accountId, accountId));
    return;
  }
  await getDb()
    .insert(personaAutoSync)
    .values({ accountId, enabled: true, secret: generateSecret(), installationId });
}

/** Clear the installation binding (e.g. on uninstall). Keeps the row + secret. */
export async function disconnectInstallation(installationId: string): Promise<void> {
  await getDb()
    .update(personaAutoSync)
    .set({ installationId: null, updatedAt: sql`now()` })
    .where(eq(personaAutoSync.installationId, installationId));
}

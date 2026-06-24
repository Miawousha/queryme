import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { personaAutoSync, type PersonaAutoSync } from "@/lib/db/schema";

export async function getAutoSyncConfig(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .select()
    .from(personaAutoSync)
    .where(eq(personaAutoSync.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/**
 * Enable auto-sync. Creates the row on first enable; on a later enable it only
 * flips the flag back on, so re-enabling is instant and an already-connected
 * GitHub App installation keeps working.
 */
export async function enableAutoSync(accountId: string): Promise<PersonaAutoSync> {
  const existing = await getAutoSyncConfig(accountId);
  if (existing) {
    const [row] = await getDb()
      .update(personaAutoSync)
      .set({ enabled: true, updatedAt: sql`now()` })
      .where(eq(personaAutoSync.accountId, accountId))
      .returning();
    return row;
  }
  const [row] = await getDb()
    .insert(personaAutoSync)
    .values({ accountId, enabled: true })
    .returning();
  return row;
}

/** Pause auto-sync, keeping the row. Returns null if no row exists. */
export async function disableAutoSync(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .update(personaAutoSync)
    .set({ enabled: false, updatedAt: sql`now()` })
    .where(eq(personaAutoSync.accountId, accountId))
    .returning();
  return row ?? null;
}

/**
 * Record that a verified delivery was received (observability only). Bumps
 * `lastDeliveryAt` but deliberately not `updatedAt` — a delivery doesn't change
 * the config the owner manages.
 */
export async function touchLastDelivery(accountId: string): Promise<void> {
  await getDb()
    .update(personaAutoSync)
    .set({ lastDeliveryAt: sql`now()` })
    .where(eq(personaAutoSync.accountId, accountId));
}

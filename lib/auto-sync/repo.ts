import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { personaAutoSync, type PersonaAutoSync } from "@/lib/db/schema";

/** 32 random bytes as hex — the GitHub webhook HMAC signing secret. */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function getAutoSyncConfig(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .select()
    .from(personaAutoSync)
    .where(eq(personaAutoSync.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/**
 * Enable auto-sync. Creates the row with a fresh secret on first enable; on a
 * later enable it only flips the flag back on, keeping the existing secret so
 * an already-installed GitHub hook keeps verifying.
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
    .values({ accountId, enabled: true, secret: generateSecret() })
    .returning();
  return row;
}

/** Pause auto-sync, keeping the secret. Returns null if no row exists. */
export async function disableAutoSync(accountId: string): Promise<PersonaAutoSync | null> {
  const [row] = await getDb()
    .update(personaAutoSync)
    .set({ enabled: false, updatedAt: sql`now()` })
    .where(eq(personaAutoSync.accountId, accountId))
    .returning();
  return row ?? null;
}

/**
 * Rotate the secret. Creates a (disabled) row if none exists yet so regenerate
 * is callable before first enable. The old secret stops verifying immediately.
 * Read-then-write: a (very unlikely) concurrent double-rotation by the same
 * owner would have the later write win, so the returned secret is the caller's
 * own — fine for a single-owner, manual admin action.
 */
export async function regenerateSecret(accountId: string): Promise<PersonaAutoSync> {
  const existing = await getAutoSyncConfig(accountId);
  if (!existing) {
    const [row] = await getDb()
      .insert(personaAutoSync)
      .values({ accountId, enabled: false, secret: generateSecret() })
      .returning();
    return row;
  }
  const [row] = await getDb()
    .update(personaAutoSync)
    .set({ secret: generateSecret(), updatedAt: sql`now()` })
    .where(eq(personaAutoSync.accountId, accountId))
    .returning();
  return row;
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

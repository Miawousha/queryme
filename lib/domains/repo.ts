import { eq, sql } from "drizzle-orm";
import { domains, type Domain, type NewDomain } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function insertDomain(db: Db, values: NewDomain): Promise<Domain> {
  const [row] = await db.insert(domains).values(values).returning();
  return row;
}

export async function getDomainById(db: Db, id: string): Promise<Domain | null> {
  const [row] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  return row ?? null;
}

export async function getDomainByHostname(db: Db, hostname: string): Promise<Domain | null> {
  const [row] = await db.select().from(domains).where(eq(domains.hostname, hostname)).limit(1);
  return row ?? null;
}

export async function listDomainsByAccount(db: Db, accountId: string): Promise<Domain[]> {
  return db.select().from(domains).where(eq(domains.accountId, accountId)).orderBy(domains.createdAt);
}

export async function countDomainsByAccount(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(domains)
    .where(eq(domains.accountId, accountId));
  return row?.n ?? 0;
}

export async function updateDomain(
  db: Db,
  id: string,
  patch: Partial<NewDomain>,
): Promise<Domain | null> {
  const [row] = await db.update(domains).set(patch).where(eq(domains.id, id)).returning();
  return row ?? null;
}

export async function deleteDomain(db: Db, id: string): Promise<void> {
  await db.delete(domains).where(eq(domains.id, id));
}

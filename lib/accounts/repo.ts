import { eq } from "drizzle-orm";
import { accounts, type Account } from "@/lib/db/schema";
import { isValidUsername, isReservedSlug } from "@/lib/accounts/slug";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function createAccount(
  db: Db,
  input: { username: string; githubId?: string | null },
): Promise<Account> {
  if (!isValidUsername(input.username)) {
    throw new Error(`invalid username: ${JSON.stringify(input.username)}`);
  }
  const [row] = await db
    .insert(accounts)
    .values({ username: input.username, githubId: input.githubId ?? null })
    .returning();
  return row;
}

export async function getAccountBySlug(db: Db, slug: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.username, slug)).limit(1);
  return row ?? null;
}

export async function getAccountById(db: Db, id: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return row ?? null;
}

/** The "house" account served at `/`. Configured via ROOT_ACCOUNT_USERNAME. */
export async function getRootAccount(db: Db): Promise<Account | null> {
  const username = process.env.ROOT_ACCOUNT_USERNAME;
  if (!username) return null;
  return getAccountBySlug(db, username);
}

/** Resolve a path slug to an account, rejecting reserved slugs. Null ⇒ 404. */
export async function resolveAccountSlug(db: Db, slug: string): Promise<Account | null> {
  if (isReservedSlug(slug)) return null;
  return getAccountBySlug(db, slug);
}

export async function getRootAccountId(db: Db): Promise<string> {
  const root = await getRootAccount(db);
  if (!root) {
    throw new Error(
      "ROOT_ACCOUNT_USERNAME is not set or no matching account exists. " +
        "Run `pnpm admin account create <username>` and the backfill script.",
    );
  }
  return root.id;
}

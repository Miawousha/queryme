import { eq, desc, sql } from "drizzle-orm";
import {
  accounts,
  conversations,
  personaSource,
  type Account,
  type AccountStatus,
} from "@/lib/db/schema";
import { isValidUsername, isReservedSlug } from "@/lib/accounts/slug";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function createAccount(
  db: Db,
  input: {
    username: string;
    githubId?: string | null;
    role?: "user" | "admin";
    status?: AccountStatus;
  },
): Promise<Account> {
  if (!isValidUsername(input.username)) {
    throw new Error(`invalid username: ${JSON.stringify(input.username)}`);
  }
  const [row] = await db
    .insert(accounts)
    .values({
      username: input.username,
      githubId: input.githubId ?? null,
      role: input.role ?? "user",
      // CLI/script provisioning is a deliberate operator action — active by
      // default. Self-serve signups pass "waitlisted" explicitly.
      status: input.status ?? "active",
    })
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

export async function getAccountByGithubId(db: Db, githubId: string): Promise<Account | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.githubId, githubId)).limit(1);
  return row ?? null;
}

/**
 * Resolve (or provision) the account for an authenticated GitHub identity.
 * - existing github_id → return it
 * - existing slug with null github_id → claim it (adopts CLI-created accounts)
 * - existing slug with a different github_id → SlugConflictError
 * - otherwise → create (slug = login, role 'user')
 * Reserved logins are rejected up front so this never touches the DB for them.
 */
export async function upsertAccountFromGitHub(
  db: Db,
  input: { githubId: string; login: string },
): Promise<Account> {
  if (isReservedSlug(input.login)) throw new ReservedLoginError(input.login);

  const byGithub = await getAccountByGithubId(db, input.githubId);
  if (byGithub) return byGithub;

  const bySlug = await getAccountBySlug(db, input.login);
  if (bySlug) {
    if (bySlug.githubId === null) {
      const [updated] = await db
        .update(accounts)
        .set({ githubId: input.githubId })
        .where(eq(accounts.id, bySlug.id))
        .returning();
      return updated;
    }
    if (bySlug.githubId !== input.githubId) throw new SlugConflictError(input.login);
    return bySlug;
  }

  // Self-serve signup: every brand-new GitHub identity starts waitlisted. A
  // super-admin approves it from the console before any public surface (or
  // paid model call) goes live for the account.
  return createAccount(db, {
    username: input.login,
    githubId: input.githubId,
    role: "user",
    status: "waitlisted",
  });
}

export async function setAccountRole(
  db: Db,
  username: string,
  role: "user" | "admin",
): Promise<Account> {
  const [row] = await db
    .update(accounts)
    .set({ role })
    .where(eq(accounts.username, username))
    .returning();
  if (!row) throw new Error(`no account '${username}'`);
  return row;
}

/** Approve (active), waitlist, or kill-switch (disabled) an account. */
export async function setAccountStatus(
  db: Db,
  username: string,
  status: AccountStatus,
): Promise<Account> {
  const [row] = await db
    .update(accounts)
    .set({ status })
    .where(eq(accounts.username, username))
    .returning();
  if (!row) throw new Error(`no account '${username}'`);
  return row;
}

export type AccountSummary = {
  id: string;
  username: string;
  githubId: string | null;
  role: "user" | "admin";
  status: AccountStatus;
  createdAt: Date;
  repoLinked: boolean;
  conversationCount: number;
};

/** Cross-account overview for the super-admin console. */
export async function listAllAccounts(db: Db): Promise<AccountSummary[]> {
  const rows = await db.select().from(accounts).orderBy(desc(accounts.createdAt));

  const convCounts = await db
    .select({ accountId: conversations.accountId, count: sql<number>`count(*)::int` })
    .from(conversations)
    .groupBy(conversations.accountId);
  const countByAccount = new Map(convCounts.map((r) => [r.accountId, r.count]));

  const linked = await db
    .selectDistinct({ accountId: personaSource.accountId })
    .from(personaSource)
    .where(eq(personaSource.status, "ok"));
  const linkedSet = new Set(linked.map((r) => r.accountId));

  return rows.map((a) => ({
    id: a.id,
    username: a.username,
    githubId: a.githubId,
    role: a.role,
    status: a.status,
    repoLinked: linkedSet.has(a.id),
    conversationCount: countByAccount.get(a.id) ?? 0,
    createdAt: a.createdAt,
  }));
}

import { getDb } from "@/lib/db/client";
import { getSessionAccountId } from "@/lib/admin/auth";
import { getAccountById, getRootAccount } from "@/lib/accounts/repo";
import type { Account } from "@/lib/db/schema";

/** The account that owns the current session, or null. */
export async function requireSessionAccount(): Promise<Account | null> {
  const id = await getSessionAccountId();
  if (!id) return null;
  return getAccountById(getDb(), id);
}

/** True when `session` may administer `target` (its owner, or any super-admin). */
export function canAdminister(session: Account | null, target: Account): boolean {
  return !!session && (session.id === target.id || session.role === "admin");
}

/** The session account when it is a super-admin, else null. */
export async function requireSuperAdmin(): Promise<Account | null> {
  const acct = await requireSessionAccount();
  return acct && acct.role === "admin" ? acct : null;
}

/** The session account when it may administer the root account, else null. */
export async function requireRootAdmin(): Promise<Account | null> {
  const session = await requireSessionAccount();
  if (!session) return null;
  const root = await getRootAccount(getDb());
  if (!root) return null;
  return canAdminister(session, root) ? session : null;
}

/**
 * True when this account holder must accept the Terms before using any
 * authenticated surface. Only gates *active* accounts — waitlisted/disabled
 * users never reach a gated surface, and gating them would trap them on the
 * interstitial. `== null` catches both a null column and an undefined field.
 */
export function needsTosAcceptance(account: Account): boolean {
  return account.status === "active" && account.tosAcceptedAt == null;
}

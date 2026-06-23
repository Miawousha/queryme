import { loadAccountForSlug } from "@/lib/accounts/load";
import { requireSessionAccount, canAdminister, needsTosAcceptance } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

export type AdminResolution =
  | { kind: "not-found" }
  | { kind: "login" }
  | { kind: "needs-tos" }
  | { kind: "ok"; account: Account };

/** Shared gate for the per-account admin page + APIs. */
export async function resolveAccountAdmin(slug: string): Promise<AdminResolution> {
  const account = await loadAccountForSlug(slug);
  if (!account) return { kind: "not-found" };
  const session = await requireSessionAccount();
  if (!session) return { kind: "login" };
  if (needsTosAcceptance(session)) return { kind: "needs-tos" };
  if (!canAdminister(session, account)) return { kind: "not-found" };
  return { kind: "ok", account };
}

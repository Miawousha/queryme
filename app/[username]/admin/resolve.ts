import { loadAccountForSlug } from "@/lib/accounts/load";
import { requireSessionAccount, canAdminister } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

export type AdminResolution =
  | { kind: "not-found" }
  | { kind: "login" }
  | { kind: "ok"; account: Account };

/** Shared gate for the per-account admin page + APIs. */
export async function resolveAccountAdmin(slug: string): Promise<AdminResolution> {
  const account = await loadAccountForSlug(slug);
  if (!account) return { kind: "not-found" };
  const session = await requireSessionAccount();
  if (!session) return { kind: "login" };
  if (!canAdminister(session, account)) return { kind: "not-found" };
  return { kind: "ok", account };
}

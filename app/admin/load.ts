import { getDb } from "@/lib/db/client";
import { requireSuperAdmin } from "@/lib/accounts/guard";
import { listAllAccounts, type AccountSummary } from "@/lib/accounts/repo";

export async function loadSuperConsole(): Promise<{ accounts: AccountSummary[] } | null> {
  const su = await requireSuperAdmin();
  if (!su) return null;
  return { accounts: await listAllAccounts(getDb()) };
}

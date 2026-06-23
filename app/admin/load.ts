import { getDb } from "@/lib/db/client";
import { requireSuperAdmin, needsTosAcceptance } from "@/lib/accounts/guard";
import { listAllAccounts, type AccountSummary } from "@/lib/accounts/repo";

export type SuperConsole =
  | { kind: "forbidden" }
  | { kind: "needs-tos" }
  | { kind: "ok"; accounts: AccountSummary[] };

export async function loadSuperConsole(): Promise<SuperConsole> {
  const su = await requireSuperAdmin();
  if (!su) return { kind: "forbidden" };
  if (needsTosAcceptance(su)) return { kind: "needs-tos" };
  return { kind: "ok", accounts: await listAllAccounts(getDb()) };
}

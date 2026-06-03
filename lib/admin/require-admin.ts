import { notFound, redirect } from "next/navigation";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import type { Account } from "@/lib/db/schema";

/**
 * Server-side gate for the per-account admin section. Mirrors the resolution
 * used by `app/[username]/admin/page.tsx` today, as a reusable helper so the
 * shared layout and each route segment gate identically. Throws (via Next's
 * `notFound`/`redirect`) on failure; returns the resolved account on success.
 */
export async function requireAdminAccount(username: string): Promise<Account> {
  const res = await resolveAccountAdmin(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");
  return res.account;
}

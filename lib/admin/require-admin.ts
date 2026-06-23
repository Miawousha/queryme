import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import type { Account } from "@/lib/db/schema";

// Dedupe the gate across the layout + page renders of a single request.
const resolveAdminCached = cache(resolveAccountAdmin);

/**
 * Server-side gate for the per-account admin section. Mirrors the resolution
 * used by `app/[username]/admin/page.tsx` today, as a reusable helper so the
 * shared layout and each route segment gate identically. Throws (via Next's
 * `notFound`/`redirect`) on failure; returns the resolved account on success.
 *
 * `resolveAdminCached` is wrapped with React's `cache()` so that duplicate
 * calls within the same request (layout + page) dedupe automatically.
 */
export async function requireAdminAccount(username: string): Promise<Account> {
  const res = await resolveAdminCached(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");
  if (res.kind === "needs-tos") redirect(`/auth/accept-tos?returnTo=/${username}/admin` as Route);
  return res.account;
}

import { getDb } from "@/lib/db/client";
import { resolveAccountSlug } from "@/lib/accounts/repo";
import type { Account } from "@/lib/db/schema";

/** Resolve a URL slug to an account (or null ⇒ render 404). */
export async function loadAccountForSlug(slug: string): Promise<Account | null> {
  return resolveAccountSlug(getDb(), slug);
}

/**
 * Resolve a slug for a PUBLIC surface (persona page, chat, KB, CV, forward).
 * Waitlisted and disabled accounts are indistinguishable from nonexistent ones
 * to visitors — public surfaces 404 rather than leak account state, and no
 * paid model call can be reached for a non-active account. Admin surfaces keep
 * using `loadAccountForSlug` so owners can set up content while waitlisted.
 */
export async function loadActiveAccountForSlug(slug: string): Promise<Account | null> {
  const account = await loadAccountForSlug(slug);
  return account && account.status === "active" ? account : null;
}

import { getDb } from "@/lib/db/client";
import { resolveAccountSlug } from "@/lib/accounts/repo";
import type { Account } from "@/lib/db/schema";

/** Resolve a URL slug to an account (or null ⇒ render 404). */
export async function loadAccountForSlug(slug: string): Promise<Account | null> {
  return resolveAccountSlug(getDb(), slug);
}

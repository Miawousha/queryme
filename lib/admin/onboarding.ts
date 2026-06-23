import type { PersonaSource } from "@/lib/db/schema";

/**
 * True when an account has no live content yet and should be steered to the
 * Content-source setup page instead of the empty Conversations view. Drives the
 * `/[username]/admin` index guard; mirrors `needsTosAcceptance` in shape.
 *
 * "No live content" means no active synced persona source — a brand-new account
 * (never connected a repo) or one whose only syncs failed (no active row). Once
 * a source syncs successfully the account lands on its normal admin home.
 */
export function needsContentOnboarding(active: PersonaSource | null): boolean {
  return active == null;
}

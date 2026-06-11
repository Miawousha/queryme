import { getPersonaStore } from "@/lib/persona/store";
import { getCachedKb } from "@/lib/kb/cache";

/**
 * Where notifications for an account's owner go: the persona's public-contact
 * email, falling back to the platform-wide env address when the persona has no
 * email (or isn't configured / fails to load) so a notification is never
 * silently dropped on a configuration gap.
 */
export async function ownerNotifyAddress(accountId: string): Promise<string> {
  const fallback = process.env.FORWARD_NOTIFICATION_TO ?? "";
  try {
    const store = getPersonaStore();
    await store.ensureReady(accountId);
    if (!store.getRoot(accountId)) return fallback;
    const kb = await getCachedKb(accountId);
    return kb.publicContact.email ?? fallback;
  } catch {
    return fallback;
  }
}

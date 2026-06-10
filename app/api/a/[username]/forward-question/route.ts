import { NextRequest, NextResponse } from "next/server";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
import { getPersonaStore } from "@/lib/persona/store";
import { getCachedKb } from "@/lib/kb/cache";
import { resendTransport } from "@/lib/notify/email";
import { handleForward } from "@/lib/questions/handle-forward";

export const runtime = "nodejs";

/**
 * Where this account's forwarded-question notifications go: the persona's
 * public-contact email. Falls back to the platform-wide env address when the
 * persona has no email (or isn't configured / fails to load) so a notification
 * is never silently dropped on a configuration gap.
 */
async function notifyToFor(accountId: string): Promise<string> {
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  return handleForward(req, {
    transport: resendTransport(),
    notifyTo: await notifyToFor(account.id),
    notifyFrom: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
  });
}

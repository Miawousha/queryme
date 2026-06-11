import { NextRequest, NextResponse } from "next/server";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
import { resendTransport } from "@/lib/notify/email";
import { ownerNotifyAddress } from "@/lib/notify/owner-email";
import { handleForward } from "@/lib/questions/handle-forward";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  return handleForward(req, {
    transport: resendTransport(),
    notifyTo: await ownerNotifyAddress(account.id),
    notifyFrom: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
  });
}

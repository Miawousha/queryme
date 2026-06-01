import { NextRequest, NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getQuestionAccountId } from "@/lib/questions/account";
import { getDb } from "@/lib/db/client";
import { resendTransport } from "@/lib/notify/email";
import { handleReply } from "@/app/api/admin/questions/[id]/reply/handler";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = await getQuestionAccountId(getDb(), id);
  if (owner !== res.account.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return handleReply(req, { params: Promise.resolve({ id }) }, {
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getQuestionAccountId } from "@/lib/questions/account";
import { getDb } from "@/lib/db/client";
import { resendTransport } from "@/lib/notify/email";
import { getPersonaStore } from "@/lib/persona/store";
import { loadPersona } from "@/lib/persona";
import { handleReply } from "@/app/api/admin/questions/[id]/reply/handler";

export const runtime = "nodejs";

/** The persona's given name for this account, or the username as a fallback
 * when no persona content is configured yet. */
async function replierNameFor(accountId: string, username: string): Promise<string> {
  try {
    const store = getPersonaStore();
    await store.ensureReady(accountId);
    const root = store.getRoot(accountId);
    return root ? loadPersona(root).givenName : username;
  } catch {
    // A persona-load failure must never block sending the reply.
    return username;
  }
}

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
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
    replierName: await replierNameFor(res.account.id, res.account.username),
  });
}

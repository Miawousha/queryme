import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRootAdmin } from "@/lib/accounts/guard";
import { getDb } from "@/lib/db/client";
import { getQuestion, recordReply } from "@/lib/questions/repo";
import type { EmailTransport } from "@/lib/notify/email";

const Body = z.object({ reply: z.string().min(1).max(20000) });

export type ReplyDeps = {
  transport: EmailTransport;
  from: string;
};

export async function handleReply(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  deps: ReplyDeps,
): Promise<NextResponse> {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { id } = await ctx.params;
  const db = getDb();
  const existing = await getQuestion(db, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await recordReply(db, id, parsed.data.reply);
  // Best-effort email — symmetry with `handleForward`'s `notified` flag. Reply
  // is already persisted; if the visitor's transport fails the admin can
  // resend manually. `emailed` is `false` either when there was no contact
  // or when the send threw.
  let emailed = false;
  if (existing.contact) {
    try {
      await deps.transport.send({
        to: existing.contact,
        from: deps.from,
        subject: "Alexandre replied to your forwarded question",
        text:
          `You asked:\n\n${existing.question}\n\n` +
          `Alexandre replied:\n\n${updated.reply}\n`,
      });
      emailed = true;
    } catch (err) {
      console.error("admin reply email failed", err);
    }
  }
  return NextResponse.json({ ok: true, id: updated.id, emailed });
}

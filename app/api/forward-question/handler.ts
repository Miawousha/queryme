import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { forwardQuestion } from "@/lib/questions/repo";
import { sendForwardNotification, type EmailTransport } from "@/lib/notify/email";

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000),
  contact: z.string().min(3).max(200).optional(),
});

export type ForwardDeps = {
  transport: EmailTransport;
  notifyTo: string;
  notifyFrom: string;
};

/** Postgres `foreign_key_violation` SQLSTATE. */
function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23503"
  );
}

export async function handleForward(
  req: NextRequest,
  deps: ForwardDeps,
): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape" }, { status: 400 });
  }
  const kv = getKv();
  const limit = await checkRateLimit(kv, {
    key: `forward:ip:${requestIp(req)}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many forwarded questions" }, { status: 429 });
  }
  const db = getDb();
  let row;
  try {
    row = await forwardQuestion(db, parsed.data);
  } catch (err) {
    // A client-supplied conversationId that references no conversation row
    // (e.g. forwarding from the intro bubble before the first chat message)
    // trips the conversation_id FK. Don't lose the question — retry without
    // the link so it's still saved (unattributed).
    if (isForeignKeyViolation(err) && parsed.data.conversationId) {
      row = await forwardQuestion(db, { ...parsed.data, conversationId: undefined });
    } else {
      throw err;
    }
  }

  // Best-effort notification. A transport failure must never fail the request:
  // the question is already persisted and the admin can still see it.
  const note = await sendForwardNotification(deps.transport, {
    to: deps.notifyTo,
    from: deps.notifyFrom,
    question: row.question,
    contact: row.contact,
    conversationId: row.conversationId,
  });

  return NextResponse.json({ ok: true, id: row.id, notified: note.ok });
}

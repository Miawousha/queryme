import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { forwardQuestion } from "@/lib/questions/repo";
import {
  sendForwardNotification,
  resendTransport,
  type EmailTransport,
} from "@/lib/notify/email";

export const runtime = "nodejs";

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
  const row = await forwardQuestion(db, parsed.data);

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

export async function POST(req: NextRequest) {
  return handleForward(req, {
    transport: resendTransport(),
    notifyTo: process.env.FORWARD_NOTIFICATION_TO ?? "",
    notifyFrom: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}

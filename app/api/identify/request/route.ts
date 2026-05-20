import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIdentification } from "@/lib/identity/service";
import { isLikelyWorkEmail } from "@/lib/identity/email-domain";
import { sendVerificationCode } from "@/lib/identity/resend";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  workEmail: z.string().email(),
  role: z.string().min(1).max(120),
  purpose: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  if (!isLikelyWorkEmail(parsed.data.workEmail)) {
    return NextResponse.json(
      { error: "Please use a work email — free-email providers (gmail, outlook, etc.) are not accepted" },
      { status: 400 },
    );
  }

  const kv = getKv();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ipLimit = await checkRateLimit(kv, { key: `identify-req:ip:${ip}`, limit: 5, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many identification requests from your IP" }, { status: 429 });
  }
  const emailLimit = await checkRateLimit(kv, { key: `identify-req:email:${parsed.data.workEmail.toLowerCase()}`, limit: 3, windowSeconds: 3600 });
  if (!emailLimit.allowed) {
    return NextResponse.json({ error: "Too many code requests for this email" }, { status: 429 });
  }

  const db = getDb();
  const result = await requestIdentification(
    { db, kv, send: sendVerificationCode },
    parsed.data,
  );

  if (!result.ok) {
    return NextResponse.json({ error: "Invalid email domain" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

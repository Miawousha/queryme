import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { forwardQuestion } from "@/lib/questions/repo";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000),
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

  const kv = getKv();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = await checkRateLimit(kv, { key: `forward:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many forwarded questions" }, { status: 429 });
  }

  const db = getDb();
  const row = await forwardQuestion(db, parsed.data);
  return NextResponse.json({ ok: true, id: row.id });
}

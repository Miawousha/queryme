import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { verifyIdentification } from "@/lib/identity/service";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid(),
  workEmail: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
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
  const limit = await checkRateLimit(kv, { key: `identify-verify:ip:${ip}`, limit: 10, windowSeconds: 3600 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many verification attempts" }, { status: 429 });
  }

  const db = getDb();
  const result = await verifyIdentification({ db, kv }, parsed.data);
  if (!result.ok) {
    if (result.reason === "code_invalid") {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }
    return NextResponse.json({ error: "Asker not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, token: result.token, askerId: result.askerId });
}

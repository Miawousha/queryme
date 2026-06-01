import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  verifyPassword,
} from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { getRootAccountId } from "@/lib/accounts/repo";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  // Throttle brute-force attempts per IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = await checkRateLimit(getKv(), {
    key: `admin-login:ip:${ip}`,
    limit: 10,
    windowSeconds: 900,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    return NextResponse.json(
      { error: "Admin area is not configured." },
      { status: 500 },
    );
  }

  if (!verifyPassword(parsed.data.password, secret)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json({ error: "Sessions are not configured." }, { status: 500 });
  }
  let rootId: string;
  try {
    rootId = await getRootAccountId(getDb());
  } catch {
    return NextResponse.json({ error: "Root account is not configured." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(rootId, Date.now() + SESSION_TTL_MS, sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}

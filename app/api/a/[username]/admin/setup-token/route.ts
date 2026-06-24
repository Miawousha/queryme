import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { createSetupToken, SETUP_TOKEN_TTL_MS } from "@/lib/admin/setup-token";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

// Mints a short-lived scoped token the owner pastes into their coding agent's
// setup prompt. Session-authed only — a token can never mint another token.
export async function POST(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Sessions not configured" }, { status: 500 });

  const limited = await checkRateLimit(getKv(), {
    key: `setup-token:${res.account.id}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const expiresAt = Date.now() + SETUP_TOKEN_TTL_MS;
  return NextResponse.json({ token: createSetupToken(res.account.id, expiresAt, secret), expiresAt });
}

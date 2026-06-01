import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/auth/github";
import { createState } from "@/lib/auth/oauth-state";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const origin = req.nextUrl.origin;
  if (!clientId || !secret) {
    return NextResponse.redirect(new URL("/auth/error?reason=not_configured", origin));
  }
  const state = createState(secret);
  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: `${origin}/api/auth/github/callback`,
    state,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("queryme_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

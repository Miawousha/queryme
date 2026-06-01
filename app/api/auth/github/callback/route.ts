import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchGitHubUser } from "@/lib/auth/github";
import { verifyState, constantTimeEqual } from "@/lib/auth/oauth-state";
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { upsertAccountFromGitHub } from "@/lib/accounts/repo";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, origin));

  const secret = process.env.SESSION_SECRET;
  if (!secret) return fail("not_configured");

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail("denied");

  const code = sp.get("code");
  const state = sp.get("state");
  const cookieState = req.cookies.get("queryme_oauth_state")?.value;
  if (
    !code ||
    !state ||
    !cookieState ||
    !constantTimeEqual(state, cookieState) ||
    !verifyState(state, Date.now(), secret)
  ) {
    return fail("bad_state");
  }

  let login: string;
  let githubId: string;
  try {
    const token = await exchangeCodeForToken(code);
    const user = await fetchGitHubUser(token); // token used only here, then dropped
    login = user.login;
    githubId = String(user.id);
  } catch {
    return fail("github");
  }

  let account;
  try {
    account = await upsertAccountFromGitHub(getDb(), { githubId, login });
  } catch (err) {
    if (err instanceof ReservedLoginError) return fail("reserved");
    if (err instanceof SlugConflictError) return fail("conflict");
    return fail("server");
  }

  const res = NextResponse.redirect(new URL(`/${account.username}/admin`, origin));
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(account.id, Date.now() + SESSION_TTL_MS, secret),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  );
  res.cookies.set("queryme_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}

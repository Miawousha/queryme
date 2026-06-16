import { NextResponse } from "next/server";
import { requireSessionAccount } from "@/lib/accounts/guard";

export const runtime = "nodejs";

/**
 * GitHub App "Setup URL" — hit after an install. The install→account mapping is
 * done authoritatively by the webhook (`installation.created`); this route is
 * purely UX: send the user back to their admin Content page (or to login if the
 * session has lapsed). It performs no privileged mutation.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const account = await requireSessionAccount();
  if (!account) {
    return NextResponse.redirect(new URL("/api/auth/github/login", origin));
  }
  return NextResponse.redirect(
    new URL(`/${account.username}/admin/settings/content?app=installed`, origin),
  );
}

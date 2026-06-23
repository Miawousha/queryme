import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { acceptTos } from "@/lib/accounts/repo";
import { safeReturnTo } from "@/lib/auth/return-to";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const accountId = await getSessionAccountId();
  if (!accountId) {
    return NextResponse.redirect(new URL("/api/auth/github/login", origin), 303);
  }
  const account = await acceptTos(getDb(), accountId);
  const form = await req.formData();
  const returnTo = safeReturnTo(form.get("returnTo")?.toString(), `/${account.username}/admin`);
  return NextResponse.redirect(new URL(returnTo, origin), 303);
}

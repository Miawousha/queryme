import { NextRequest, NextResponse } from "next/server";
import { handleKbManifest } from "@/lib/kb/handlers";
import { loadAccountForSlug } from "@/lib/accounts/load";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }): Promise<Response> {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  return handleKbManifest(account.id);
}

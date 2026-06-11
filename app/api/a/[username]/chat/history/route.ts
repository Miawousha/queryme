import { NextRequest, NextResponse } from "next/server";
import { handleChatHistory } from "@/lib/chat/handle-history";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }): Promise<Response> {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  return handleChatHistory(req, account.id);
}

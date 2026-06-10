import { NextRequest, NextResponse } from "next/server";
import { handleChat } from "@/lib/chat/handle-chat";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  return handleChat(req, account.id);
}

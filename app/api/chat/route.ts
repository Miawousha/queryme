import { NextRequest } from "next/server";
import { handleChat } from "@/lib/chat/handle-chat";
import { resolveRootAccountId } from "@/lib/accounts/root";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleChat(req, await resolveRootAccountId());
}

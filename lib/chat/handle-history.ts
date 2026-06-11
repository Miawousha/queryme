import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { findOwnedConversation } from "@/lib/conversations/repo";
import { isUuid } from "@/lib/uuid";
import { HISTORY_TURNS_CAP } from "@/lib/chat/limits";

/**
 * GET /api/a/[username]/chat/history?conversationId=<uuid>
 *
 * Returns the stored transcript for ONE conversation, scoped to the resolved
 * account. The uuid is the same unguessable bearer token the chat POST trusts;
 * unknown, foreign-account, and malformed ids are all indistinguishable 404s.
 */
export async function handleChatHistory(req: NextRequest, accountId: string): Promise<Response> {
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json(
      { error: "A `conversationId` query parameter is required." },
      { status: 400 },
    );
  }

  // Gate on the uuid shape before the query: the db driver throws on a
  // malformed uuid cast (→ 500), and a malformed id is semantically just an
  // unknown one — the client treats both by starting a fresh conversation.
  if (!isUuid(conversationId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = await findOwnedConversation(getDb(), {
    id: conversationId,
    channel: "chat",
    accountId,
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const transcript = conversation.transcript ?? [];
  return NextResponse.json({
    conversationId: conversation.id,
    // Sticky conversation language ("en" | "fr" | null). The client adopts it
    // so the rehydrated thread and any continuation stay in one language.
    language: conversation.language,
    turns: transcript.slice(-HISTORY_TURNS_CAP),
  });
}

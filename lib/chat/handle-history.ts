import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { findOwnedConversation } from "@/lib/conversations/repo";
import { isUuid } from "@/lib/uuid";
import { MAX_TURNS } from "@/lib/chat/handle-chat";

/**
 * Max transcript turns the history endpoint returns (the most recent win).
 *
 * The cap is derived from — and must stay BELOW — the chat POST's MAX_TURNS:
 * the client seeds these turns into `useChat`, and every continuation echoes
 * the whole thread back through `/api/chat`, which rejects > MAX_TURNS
 * messages. Returning MAX_TURNS or more would render a thread whose very next
 * message 400s. MAX_TURNS − 10 restores any realistic conversation in full
 * while leaving ten message slots of headroom before that (pre-existing)
 * ceiling is reached.
 */
export const HISTORY_TURNS_CAP = MAX_TURNS - 10;

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
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const conversation = await findOwnedConversation(getDb(), {
    id: conversationId,
    channel: "chat",
    accountId,
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
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

import { eq, sql } from "drizzle-orm";
import { conversations, type Conversation, type ConversationTurn } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function getOrCreateConversation(
  db: Db,
  input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr" },
): Promise<Conversation> {
  const existing = await db.select().from(conversations).where(eq(conversations.id, input.id));
  if (existing.length > 0) return existing[0];

  const [inserted] = await db
    .insert(conversations)
    .values({
      id: input.id,
      channel: input.channel,
      language: input.language,
      transcript: [],
    })
    .returning();
  return inserted;
}

export async function appendTurn(db: Db, conversationId: string, turn: ConversationTurn): Promise<void> {
  await db
    .update(conversations)
    .set({
      transcript: sql`coalesce(${conversations.transcript}, '[]'::jsonb) || ${JSON.stringify([turn])}::jsonb`,
      lastMessageAt: sql`now()`,
    })
    .where(eq(conversations.id, conversationId));
}

export async function isConversationUnlockedInDb(db: Db, conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ unlockedAt: conversations.sensitiveUnlockedAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (rows.length === 0) return false;
  const at = rows[0].unlockedAt;
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < 24 * 60 * 60 * 1000;
}

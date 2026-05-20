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

  // Use INSERT ... ON CONFLICT DO NOTHING so two concurrent requests for the
  // same fresh conversationId can't both insert and 500 on a unique violation.
  const [inserted] = await db
    .insert(conversations)
    .values({
      id: input.id,
      channel: input.channel,
      language: input.language,
      transcript: [],
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  // The row already existed (the other request won the race): re-SELECT it.
  const [row] = await db.select().from(conversations).where(eq(conversations.id, input.id));
  if (!row) {
    throw new Error(`getOrCreateConversation: conversation ${input.id} vanished after conflict`);
  }
  return row;
}

export async function appendTurn(db: Db, conversationId: string, turn: ConversationTurn): Promise<void> {
  const updated = await db
    .update(conversations)
    .set({
      transcript: sql`coalesce(${conversations.transcript}, '[]'::jsonb) || ${JSON.stringify([turn])}::jsonb`,
      lastMessageAt: sql`now()`,
    })
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });

  // An UPDATE that matched no rows silently drops the turn — surface it instead.
  if (updated.length === 0) {
    throw new Error(`appendTurn: conversation ${conversationId} does not exist; turn was not persisted`);
  }
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

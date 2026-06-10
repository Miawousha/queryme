import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { conversations, type Conversation, type ConversationTurn } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

type ConversationKey = { id: string; channel: "chat" | "mcp"; accountId?: string };

/**
 * Ownership filter: a conversation belongs to the caller only when its id,
 * channel, and account all match. The id alone is client-supplied (and only
 * UUIDv4-unguessable), so matching it in isolation would let a request to one
 * account append to — or read — another account's conversation.
 */
function ownedBy(input: ConversationKey): SQL | undefined {
  return and(
    eq(conversations.id, input.id),
    eq(conversations.channel, input.channel),
    input.accountId
      ? eq(conversations.accountId, input.accountId)
      : isNull(conversations.accountId),
  );
}

export async function getOrCreateConversation(
  db: Db,
  input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr"; accountId?: string },
): Promise<Conversation> {
  const existing = await db.select().from(conversations).where(ownedBy(input));
  if (existing.length > 0) return existing[0];

  // Use INSERT ... ON CONFLICT DO NOTHING so two concurrent requests for the
  // same fresh conversationId can't both insert and 500 on a unique violation.
  const [inserted] = await db
    .insert(conversations)
    .values({
      id: input.id,
      channel: input.channel,
      language: input.language,
      accountId: input.accountId,
      transcript: [],
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  // The id already exists. Either a same-owner concurrent request won the race
  // (the scoped re-SELECT returns its row), or the id belongs to a different
  // account/channel — in which case we must refuse rather than hand back
  // someone else's conversation.
  const [row] = await db.select().from(conversations).where(ownedBy(input));
  if (!row) {
    throw new Error(
      `getOrCreateConversation: conversation ${input.id} is not accessible for this account/channel`,
    );
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

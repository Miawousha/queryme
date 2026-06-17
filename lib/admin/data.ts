/** Read model for the admin dashboard — one query pass over the two tables. */

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import {
  conversations,
  forwardedQuestions,
  type Conversation,
  type ConversationTurn,
  type ForwardedQuestion,
} from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** Most recent conversations shown on the dashboard. */
export const CONVERSATION_LIMIT = 200;
/** Most recent forwarded questions shown on the dashboard. */
export const QUESTION_LIMIT = 200;

/**
 * A conversation as shown in the list: every column except the (potentially
 * large) `transcript` jsonb, which is replaced by a cheap `turnCount`. The full
 * transcript is fetched on demand when a row is opened — see
 * {@link loadConversationTranscript} — so the list payload stays small.
 */
export type ConversationListItem = Omit<Conversation, "transcript"> & { turnCount: number };

/** Most-recent conversations for the account (capped at CONVERSATION_LIMIT). */
export async function loadConversations(
  db: Db,
  accountId: string,
): Promise<ConversationListItem[]> {
  return db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      language: conversations.language,
      interviewer: conversations.interviewer,
      startedAt: conversations.startedAt,
      lastMessageAt: conversations.lastMessageAt,
      accountId: conversations.accountId,
      turnCount: sql<number>`jsonb_array_length(${conversations.transcript})`.mapWith(Number),
    })
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(CONVERSATION_LIMIT);
}

/**
 * The transcript for a single conversation, scoped to the owning account so the
 * id alone can't read another account's data. Returns `null` when the
 * conversation does not exist or is not owned by `accountId`.
 */
export async function loadConversationTranscript(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationTurn[] | null> {
  const [row] = await db
    .select({ transcript: conversations.transcript })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
    .limit(1);
  return row ? row.transcript : null;
}

/** Forwarded questions for the account, most recent first (capped at QUESTION_LIMIT). */
export async function loadQuestions(db: Db, accountId: string): Promise<ForwardedQuestion[]> {
  const rows = await db
    .select({ q: forwardedQuestions })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(forwardedQuestions.createdAt))
    .limit(QUESTION_LIMIT);
  return rows.map((r) => r.q);
}

export type AdminCounts = { conversations: number; unanswered: number };

/** Cheap COUNT(*) queries for the nav-rail badges. */
export async function loadAdminCounts(db: Db, accountId: string): Promise<AdminCounts> {
  const [convRow] = await db
    .select({ n: count() })
    .from(conversations)
    .where(eq(conversations.accountId, accountId));
  const [unansweredRow] = await db
    .select({ n: count() })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(and(eq(conversations.accountId, accountId), isNull(forwardedQuestions.answeredAt)));
  return { conversations: Number(convRow.n), unanswered: Number(unansweredRow.n) };
}

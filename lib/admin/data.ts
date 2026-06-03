/** Read model for the admin dashboard — one query pass over the two tables. */

import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import {
  conversations,
  forwardedQuestions,
  type Conversation,
  type ForwardedQuestion,
} from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** Most recent conversations shown on the dashboard. */
export const CONVERSATION_LIMIT = 200;

/** Most-recent conversations for the account (capped at CONVERSATION_LIMIT). */
export async function loadConversations(db: Db, accountId: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(CONVERSATION_LIMIT);
}

/** Forwarded questions for the account, most recent first. */
export async function loadQuestions(db: Db, accountId: string): Promise<ForwardedQuestion[]> {
  const rows = await db
    .select({ q: forwardedQuestions })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(forwardedQuestions.createdAt));
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

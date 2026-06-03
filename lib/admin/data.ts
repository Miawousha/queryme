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

export type AdminStats = {
  conversations: number;
  chat: number;
  mcp: number;
  questions: number;
  unanswered: number;
  identified: number;
};

export type AdminData = {
  stats: AdminStats;
  conversations: Conversation[];
  questions: ForwardedQuestion[];
  /** Conversations whose visitor the agent has identified. */
  interviewers: Conversation[];
};

/** Pure shaping of the two raw tables into the dashboard read model. */
export function buildAdminData(
  convs: Conversation[],
  questionRows: ForwardedQuestion[],
): AdminData {
  const interviewers = convs.filter((c) => c.interviewer != null);
  return {
    stats: {
      conversations: convs.length,
      chat: convs.filter((c) => c.channel === "chat").length,
      mcp: convs.filter((c) => c.channel === "mcp").length,
      questions: questionRows.length,
      unanswered: questionRows.filter((q) => q.answeredAt === null).length,
      identified: interviewers.length,
    },
    conversations: convs,
    questions: questionRows,
    interviewers,
  };
}

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

export async function loadAdminData(db: Db, accountId: string): Promise<AdminData> {
  const [convs, qRows] = await Promise.all([
    loadConversations(db, accountId),
    loadQuestions(db, accountId),
  ]);
  return buildAdminData(convs, qRows);
}

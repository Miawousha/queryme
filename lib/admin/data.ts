/** Read model for the admin dashboard — one query pass over the two tables. */

import { desc, eq } from "drizzle-orm";
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

export async function loadAdminData(db: Db, accountId: string): Promise<AdminData> {
  const [convs, qRows] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(CONVERSATION_LIMIT),
    db
      .select({ q: forwardedQuestions })
      .from(forwardedQuestions)
      .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
      .where(eq(conversations.accountId, accountId))
      .orderBy(desc(forwardedQuestions.createdAt)),
  ]);
  return buildAdminData(
    convs,
    qRows.map((r) => r.q),
  );
}

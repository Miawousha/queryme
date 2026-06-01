import { desc, eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { conversations, forwardedQuestions } from "@/lib/db/schema";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

type Db = ReturnType<typeof getDb>;

export async function getAnalytics(db: Db, accountId: string, now: Date = new Date()) {
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.lastMessageAt));
  const qs = await db
    .select({ q: forwardedQuestions })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(conversations.accountId, accountId));
  const questionRows = qs.map((r) => r.q);
  return {
    perDay: conversationsPerDay(convs, 30, now),
    topics: topQuestionTopics(questionRows),
    density: convs
      .map((c) => citationDensityPerConversation({ id: c.id, transcript: c.transcript ?? [] }))
      .filter((dd) => dd.assistantTurns > 0)
      .sort((x, y) => x.avgCitations - y.avgCitations),
  };
}

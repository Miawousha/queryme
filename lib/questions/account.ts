import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { forwardedQuestions, conversations } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** The account that owns a forwarded question (via its conversation), or null. */
export async function getQuestionAccountId(db: Db, questionId: string): Promise<string | null> {
  const [row] = await db
    .select({ accountId: conversations.accountId })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(forwardedQuestions.id, questionId))
    .limit(1);
  return row?.accountId ?? null;
}

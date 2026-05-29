import { desc, eq, isNull } from "drizzle-orm";
import { forwardedQuestions, type ForwardedQuestion } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function forwardQuestion(
  db: Db,
  input: { question: string; conversationId?: string; contact?: string | null },
): Promise<ForwardedQuestion> {
  const [inserted] = await db
    .insert(forwardedQuestions)
    .values({
      question: input.question,
      conversationId: input.conversationId,
      contact: input.contact ?? null,
    })
    .returning();
  return inserted;
}

export async function listOpenQuestions(db: Db): Promise<ForwardedQuestion[]> {
  return await db
    .select()
    .from(forwardedQuestions)
    .where(isNull(forwardedQuestions.answeredAt))
    .orderBy(desc(forwardedQuestions.createdAt));
}

export async function recordReply(
  db: Db,
  id: string,
  reply: string,
): Promise<ForwardedQuestion> {
  const [updated] = await db
    .update(forwardedQuestions)
    .set({ reply, answeredAt: new Date() })
    .where(eq(forwardedQuestions.id, id))
    .returning();
  if (!updated) throw new Error(`recordReply: no row with id ${id}`);
  return updated;
}

export async function getQuestion(db: Db, id: string): Promise<ForwardedQuestion | null> {
  const rows = await db
    .select()
    .from(forwardedQuestions)
    .where(eq(forwardedQuestions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

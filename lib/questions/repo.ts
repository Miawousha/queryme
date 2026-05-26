import { desc, eq, isNull } from "drizzle-orm";
import { questionsForAlex, type QuestionForAlex } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function forwardQuestion(
  db: Db,
  input: { question: string; conversationId?: string; contact?: string | null },
): Promise<QuestionForAlex> {
  const [inserted] = await db
    .insert(questionsForAlex)
    .values({
      question: input.question,
      conversationId: input.conversationId,
      contact: input.contact ?? null,
    })
    .returning();
  return inserted;
}

export async function listOpenQuestions(db: Db): Promise<QuestionForAlex[]> {
  return await db
    .select()
    .from(questionsForAlex)
    .where(isNull(questionsForAlex.answeredAt))
    .orderBy(desc(questionsForAlex.createdAt));
}

export async function recordReply(
  db: Db,
  id: string,
  reply: string,
): Promise<QuestionForAlex> {
  const [updated] = await db
    .update(questionsForAlex)
    .set({ reply, answeredAt: new Date() })
    .where(eq(questionsForAlex.id, id))
    .returning();
  if (!updated) throw new Error(`recordReply: no row with id ${id}`);
  return updated;
}

export async function getQuestion(db: Db, id: string): Promise<QuestionForAlex | null> {
  const rows = await db
    .select()
    .from(questionsForAlex)
    .where(eq(questionsForAlex.id, id))
    .limit(1);
  return rows[0] ?? null;
}

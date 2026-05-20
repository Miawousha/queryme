import { desc, isNull } from "drizzle-orm";
import { questionsForAlex, type QuestionForAlex } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export async function forwardQuestion(
  db: Db,
  input: { question: string; conversationId?: string; askerId?: string },
): Promise<QuestionForAlex> {
  const [inserted] = await db
    .insert(questionsForAlex)
    .values({
      question: input.question,
      conversationId: input.conversationId,
      askerId: input.askerId,
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

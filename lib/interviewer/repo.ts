import { eq } from "drizzle-orm";
import { conversations, type InterviewerIdentity } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

/**
 * Overwrite the interviewer identity for a conversation. The agent re-states
 * the complete identity it knows on each `identify_interviewer` call, so this
 * is a plain overwrite — no merge logic.
 */
export async function setInterviewer(
  db: Db,
  conversationId: string,
  identity: InterviewerIdentity,
): Promise<void> {
  const updated = await db
    .update(conversations)
    .set({ interviewer: identity })
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });

  // An UPDATE that matched no rows silently drops the identity — surface it.
  if (updated.length === 0) {
    throw new Error(
      `setInterviewer: conversation ${conversationId} does not exist; identity was not persisted`,
    );
  }
}

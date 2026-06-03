import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("loadAdminCounts (account filter, integration)", () => {
  it("counts conversations and unanswered questions for the account", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations, forwardedQuestions } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { getOrCreateConversation } = await import("@/lib/conversations/repo");
    const { loadAdminCounts } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const a = await createAccount(db, { username: `counts-a-${Date.now()}` });
    const cid = randomUUID();
    await getOrCreateConversation(db, { id: cid, channel: "chat", accountId: a.id });
    const qid = randomUUID();
    await db.insert(forwardedQuestions).values({ id: qid, conversationId: cid, question: "Q?" });
    try {
      const counts = await loadAdminCounts(db, a.id);
      expect(counts.conversations).toBe(1);
      expect(counts.unanswered).toBe(1);
    } finally {
      await db.delete(forwardedQuestions).where(eq(forwardedQuestions.id, qid));
      await db.delete(conversations).where(eq(conversations.id, cid));
      await db.delete(accounts).where(eq(accounts.id, a.id));
    }
  });
});

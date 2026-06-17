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

d("loadConversations (list payload, integration)", () => {
  it("returns turnCount and omits the transcript body from the list", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { loadConversations } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const a = await createAccount(db, { username: `list-a-${Date.now()}` });
    const cid = randomUUID();
    await db.insert(conversations).values({
      id: cid,
      channel: "chat",
      accountId: a.id,
      transcript: [
        { role: "user", text: "hi", at: "2026-05-22T00:00:00.000Z" },
        { role: "assistant", text: "hello", at: "2026-05-22T00:01:00.000Z" },
      ],
    });
    try {
      const [row] = await loadConversations(db, a.id);
      expect(row.turnCount).toBe(2);
      expect("transcript" in row).toBe(false);
    } finally {
      await db.delete(conversations).where(eq(conversations.id, cid));
      await db.delete(accounts).where(eq(accounts.id, a.id));
    }
  });
});

d("loadConversationTranscript (account scoping, integration)", () => {
  it("returns the transcript for the owner and null for another account", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { loadConversationTranscript } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const owner = await createAccount(db, { username: `owner-${Date.now()}` });
    const other = await createAccount(db, { username: `other-${Date.now()}` });
    const cid = randomUUID();
    await db.insert(conversations).values({
      id: cid,
      channel: "chat",
      accountId: owner.id,
      transcript: [{ role: "user", text: "secret", at: "2026-05-22T00:00:00.000Z" }],
    });
    try {
      const mine = await loadConversationTranscript(db, owner.id, cid);
      expect(mine).toHaveLength(1);
      expect(mine?.[0].text).toBe("secret");
      // Same id, wrong account → no leak.
      expect(await loadConversationTranscript(db, other.id, cid)).toBeNull();
      // Unknown id → null.
      expect(await loadConversationTranscript(db, owner.id, randomUUID())).toBeNull();
    } finally {
      await db.delete(conversations).where(eq(conversations.id, cid));
      await db.delete(accounts).where(eq(accounts.id, owner.id));
      await db.delete(accounts).where(eq(accounts.id, other.id));
    }
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts, conversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAccount } from "@/lib/accounts/repo";
import { getOrCreateConversation } from "@/lib/conversations/repo";
import { randomUUID } from "node:crypto";

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("two-account isolation (integration)", () => {
  const db = getDb();
  const ids: string[] = [];
  const convIds: string[] = [];

  afterAll(async () => {
    for (const c of convIds) await db.delete(conversations).where(eq(conversations.id, c));
    for (const id of ids) await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("scopes conversations to their owning account", async () => {
    const a = await createAccount(db, { username: `iso-a-${Date.now()}` }); ids.push(a.id);
    const b = await createAccount(db, { username: `iso-b-${Date.now()}` }); ids.push(b.id);
    const ca = randomUUID(); convIds.push(ca);
    await getOrCreateConversation(db, { id: ca, channel: "chat", accountId: a.id });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, ca));
    expect(row.accountId).toBe(a.id);
    expect(row.accountId).not.toBe(b.id);
  });

  it("refuses to hand another account's conversation to a different account", async () => {
    const a = await createAccount(db, { username: `iso-c-${Date.now()}` }); ids.push(a.id);
    const b = await createAccount(db, { username: `iso-d-${Date.now()}` }); ids.push(b.id);
    const cid = randomUUID(); convIds.push(cid);

    // A owns the conversation.
    await getOrCreateConversation(db, { id: cid, channel: "chat", accountId: a.id });

    // B presents A's conversationId — it must NOT receive A's conversation
    // (the id collides on the PK, so no new row is created either).
    await expect(
      getOrCreateConversation(db, { id: cid, channel: "chat", accountId: b.id }),
    ).rejects.toThrow();

    // A still reaches its own conversation, and no turn leaked into it.
    const own = await getOrCreateConversation(db, { id: cid, channel: "chat", accountId: a.id });
    expect(own.accountId).toBe(a.id);
  });
});

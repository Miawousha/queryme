import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { buildAdminData } from "@/lib/admin/data";
import type { Conversation, ForwardedQuestion } from "@/lib/db/schema";

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    ...overrides,
  };
}

describe("buildAdminData", () => {
  it("counts identified conversations and collects them into interviewers", () => {
    const convs: Conversation[] = [
      conv({ id: "a", channel: "chat" }),
      conv({
        id: "b",
        channel: "mcp",
        interviewer: { name: "Sarah", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
      }),
      conv({ id: "c", channel: "chat" }),
    ];
    const questions: ForwardedQuestion[] = [];

    const data = buildAdminData(convs, questions);

    expect(data.stats.conversations).toBe(3);
    expect(data.stats.chat).toBe(2);
    expect(data.stats.mcp).toBe(1);
    expect(data.stats.identified).toBe(1);
    expect(data.interviewers.map((c) => c.id)).toEqual(["b"]);
  });

  it("reports zero identified when no conversation has an interviewer", () => {
    const data = buildAdminData([conv({ id: "a" })], []);
    expect(data.stats.identified).toBe(0);
    expect(data.interviewers).toEqual([]);
  });
});

const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("loadAdminData (account filter, integration)", () => {
  it("returns only the given account's conversations", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { getOrCreateConversation } = await import("@/lib/conversations/repo");
    const { loadAdminData } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const a = await createAccount(db, { username: `dataf-a-${Date.now()}` });
    const b = await createAccount(db, { username: `dataf-b-${Date.now()}` });
    const ca = randomUUID();
    await getOrCreateConversation(db, { id: ca, channel: "chat", accountId: a.id });
    try {
      const data = await loadAdminData(db, a.id);
      expect(data.conversations.some((c) => c.id === ca)).toBe(true);
      const dataB = await loadAdminData(db, b.id);
      expect(dataB.conversations.some((c) => c.id === ca)).toBe(false);
    } finally {
      await db.delete(conversations).where(eq(conversations.id, ca));
      await db.delete(accounts).where(eq(accounts.id, a.id));
      await db.delete(accounts).where(eq(accounts.id, b.id));
    }
  });
});

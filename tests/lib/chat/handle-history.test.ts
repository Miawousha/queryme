import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleChatHistory } from "@/lib/chat/handle-history";
import { HISTORY_TURNS_CAP, MAX_TURNS } from "@/lib/chat/limits";
import { findOwnedConversation } from "@/lib/conversations/repo";
import type { Conversation, ConversationTurn } from "@/lib/db/schema";
import type { NextRequest } from "next/server";

// The handler only needs a db handle to pass through to the (mocked) repo.
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/conversations/repo", () => ({
  findOwnedConversation: vi.fn(async () => null),
}));

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000abc";
const CONVERSATION_ID = "11111111-2222-4333-8444-555555555555";

function get(conversationId: string | null): Promise<Response> {
  const url = new URL("http://localhost/api/a/fixture/chat/history");
  if (conversationId !== null) url.searchParams.set("conversationId", conversationId);
  // The handler only reads the URL; a plain Request is structurally fine.
  return handleChatHistory(new Request(url) as unknown as NextRequest, ACCOUNT_ID);
}

function turn(i: number, role: "user" | "assistant" = i % 2 === 0 ? "user" : "assistant"): ConversationTurn {
  return { role, text: `turn ${i}`, at: new Date(2026, 0, 1, 0, i).toISOString() };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    channel: "chat",
    language: "fr",
    transcript: [turn(0), turn(1)],
    interviewer: null,
    startedAt: new Date(),
    lastMessageAt: new Date(),
    accountId: ACCOUNT_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(findOwnedConversation).mockReset().mockResolvedValue(null);
});

describe("handleChatHistory — input validation", () => {
  it("400s when no conversationId is given", async () => {
    expect((await get(null)).status).toBe(400);
  });

  it("404s a malformed conversationId without touching the db (no uuid-cast 500)", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get("'; drop table conversations; --")).status).toBe(404);
    expect(findOwnedConversation).not.toHaveBeenCalled();
  });
});

describe("handleChatHistory — scoping", () => {
  it("404s an unknown id (repo finds nothing)", async () => {
    expect((await get(CONVERSATION_ID)).status).toBe(404);
  });

  it("scopes the lookup to the resolved account and the chat channel", async () => {
    // The ownership filter (id + channel + accountId all matching) lives in
    // the repo; the handler's contract is to pass the caller's account
    // through so a conversation owned by another account resolves to null.
    await get(CONVERSATION_ID);
    expect(findOwnedConversation).toHaveBeenCalledWith(expect.anything(), {
      id: CONVERSATION_ID,
      channel: "chat",
      accountId: ACCOUNT_ID,
    });
  });
});

describe("handleChatHistory — happy path", () => {
  it("returns the turns plus the conversation's sticky language", async () => {
    vi.mocked(findOwnedConversation).mockResolvedValue(conversation());

    const res = await get(CONVERSATION_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversationId).toBe(CONVERSATION_ID);
    expect(body.language).toBe("fr");
    expect(body.turns).toEqual([turn(0), turn(1)]);
  });

  it("returns language null for a conversation that never set one", async () => {
    vi.mocked(findOwnedConversation).mockResolvedValue(conversation({ language: null }));

    const body = await (await get(CONVERSATION_ID)).json();
    expect(body.language).toBeNull();
  });

  it("caps the response to the last HISTORY_TURNS_CAP turns, dropping the oldest", async () => {
    const transcript = Array.from({ length: HISTORY_TURNS_CAP + 5 }, (_, i) => turn(i));
    vi.mocked(findOwnedConversation).mockResolvedValue(conversation({ transcript }));

    const body = await (await get(CONVERSATION_ID)).json();
    expect(body.turns).toHaveLength(HISTORY_TURNS_CAP);
    expect(body.turns[0].text).toBe("turn 5"); // the 5 oldest were dropped
    expect(body.turns[body.turns.length - 1].text).toBe(`turn ${HISTORY_TURNS_CAP + 4}`);
  });

  it("keeps the cap under the chat POST's MAX_TURNS so a seeded thread can continue", async () => {
    // Continuation echoes the seeded history back to /api/chat, which rejects
    // > MAX_TURNS messages — a cap at or above it would brick the next turn.
    expect(HISTORY_TURNS_CAP).toBeLessThan(MAX_TURNS);
  });
});

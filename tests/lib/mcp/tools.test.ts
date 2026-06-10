import { describe, it, expect, vi } from "vitest";
import { handleAsk, handleForwardQuestion } from "@/lib/mcp/tools";
import type { AskDeps, ForwardQuestionDeps } from "@/lib/mcp/tools";

// A minimal in-memory conversation store standing in for the Drizzle `db`.
// Only the methods the handlers call are implemented.
function makeConversationStore() {
  const rows = new Map<string, { id: string; channel: string; transcript: { role: "user" | "assistant"; text: string; at: string }[] }>();
  return {
    rows,
    getOrCreateConversation: async (
      _db: unknown,
      input: { id: string; channel: "chat" | "mcp" },
    ) => {
      let row = rows.get(input.id);
      if (!row) {
        row = { id: input.id, channel: input.channel, transcript: [] };
        rows.set(input.id, row);
      }
      return row;
    },
    appendTurn: async (
      _db: unknown,
      conversationId: string,
      turn: { role: "user" | "assistant"; text: string; at: string },
    ) => {
      const row = rows.get(conversationId);
      if (!row) throw new Error(`appendTurn: conversation ${conversationId} does not exist`);
      row.transcript.push(turn);
    },
  };
}

// Metering stubs for tests that aren't about quota: the non-UUID sentinel
// accountId makes handleAsk skip checkQuota/recordUsage entirely (the
// PERSONA_LOCAL_OVERRIDE dev/test flow).
function meteringStubs() {
  return {
    accountId: "local-override",
    checkQuota: vi.fn(async () => ({ allowed: true as const })),
    recordUsage: vi.fn(async () => {}),
  };
}

describe("handleAsk", () => {
  it("generates a conversationId when omitted and returns it", async () => {
    const store = makeConversationStore();
    const deps: AskDeps = {
      db: {} as never,
      ...meteringStubs(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async () => ({ text: "the answer", usage: { inputTokens: 1, outputTokens: 2 } }),
    };

    const result = await handleAsk(deps, { question: "What is your experience?" });

    expect(result.answer).toBe("the answer");
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a provided conversationId and reconstructs history from the transcript", async () => {
    const store = makeConversationStore();
    const convId = "11111111-1111-4111-8111-111111111111";
    // Seed a prior conversation with one full turn pair.
    store.rows.set(convId, {
      id: convId,
      channel: "mcp",
      transcript: [
        { role: "user", text: "earlier question", at: "2026-05-20T00:00:00.000Z" },
        { role: "assistant", text: "earlier answer", at: "2026-05-20T00:00:01.000Z" },
      ],
    });

    let seenMessages: { role: string; content: string }[] = [];
    const deps: AskDeps = {
      db: {} as never,
      ...meteringStubs(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async ({ messages }) => {
        seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return { text: "fresh answer", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    };

    const result = await handleAsk(deps, { question: "follow-up question", conversationId: convId });

    expect(result.conversationId).toBe(convId);
    // History (2 prior turns) + the new user question.
    expect(seenMessages).toEqual([
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "follow-up question" },
    ]);
    // Both the new user turn and the assistant turn were appended.
    expect(store.rows.get(convId)!.transcript.map((t) => t.text)).toEqual([
      "earlier question",
      "earlier answer",
      "follow-up question",
      "fresh answer",
    ]);
  });

  it("caps reconstructed prior history to the most recent turns", async () => {
    const store = makeConversationStore();
    const convId = "55555555-5555-4555-8555-555555555555";
    // Seed a transcript with far more than the history cap (50 turns).
    // 100 turns alternating user/assistant.
    const cap = 50;
    const transcript = Array.from({ length: cap * 2 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `turn ${i}`,
      at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    store.rows.set(convId, { id: convId, channel: "mcp", transcript });

    let seenMessages: { role: string; content: string }[] = [];
    const deps: AskDeps = {
      db: {} as never,
      ...meteringStubs(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async ({ messages }) => {
        seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return { text: "answer", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    };

    await handleAsk(deps, { question: "newest question", conversationId: convId });

    // Capped history (<= cap) + the 1 new question.
    expect(seenMessages.length).toBeLessThanOrEqual(cap + 1);
    expect(seenMessages.length).toBe(cap + 1);
    // The oldest KEPT turn is the (cap*2 - cap) = turn 50, not turn 0.
    expect(seenMessages[0]).toEqual({ role: "user", content: `turn ${cap}` });
    expect(seenMessages[seenMessages.length - 1]).toEqual({
      role: "user",
      content: "newest question",
    });
  });

  it("rejects an empty question via input validation", async () => {
    const store = makeConversationStore();
    const deps: AskDeps = {
      db: {} as never,
      ...meteringStubs(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async () => ({ text: "x", usage: { inputTokens: 1, outputTokens: 2 } }),
    };

    await expect(handleAsk(deps, { question: "" })).rejects.toThrow();
  });

  it("passes the conversationId to produceAnswer", async () => {
    const store = makeConversationStore();
    const convId = "33333333-3333-4333-8333-333333333333";
    let seenConversationId: string | undefined;
    const deps: AskDeps = {
      db: {} as never,
      ...meteringStubs(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async ({ conversationId }) => {
        seenConversationId = conversationId;
        return { text: "answer", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    };

    await handleAsk(deps, { question: "who built this?", conversationId: convId });

    expect(seenConversationId).toBe(convId);
  });
});

describe("handleAsk quota + metering", () => {
  const UUID_ACCOUNT = "44444444-4444-4444-8444-444444444444";

  function quotaDeps(overrides: Partial<AskDeps> = {}): AskDeps {
    const store = makeConversationStore();
    return {
      db: {} as never,
      accountId: UUID_ACCOUNT,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async () => ({ text: "the answer", usage: { inputTokens: 123, outputTokens: 45 } }),
      checkQuota: vi.fn(async () => ({ allowed: true as const })),
      recordUsage: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("rejects an over-quota account before producing an answer", async () => {
    const produceAnswer = vi.fn(async () => ({
      text: "x",
      usage: { inputTokens: 1, outputTokens: 2 },
    }));
    const deps = quotaDeps({
      produceAnswer,
      checkQuota: vi.fn(async () => ({
        allowed: false as const,
        reason: "daily_messages" as const,
      })),
    });

    await expect(handleAsk(deps, { question: "q" })).rejects.toThrow(/quota_exceeded/);
    // No paid model call — the cap is enforced before produceAnswer.
    expect(produceAnswer).not.toHaveBeenCalled();
    expect(deps.recordUsage).not.toHaveBeenCalled();
  });

  it("records usage with channel mcp and the produced token counts", async () => {
    const deps = quotaDeps();

    const result = await handleAsk(deps, { question: "q" });

    expect(result.answer).toBe("the answer");
    expect(deps.recordUsage).toHaveBeenCalledWith(deps.db, {
      accountId: UUID_ACCOUNT,
      channel: "mcp",
      inputTokens: 123,
      outputTokens: 45,
    });
  });

  it("zeroes token counts the provider did not report", async () => {
    const deps = quotaDeps({
      produceAnswer: async () => ({
        text: "answer",
        usage: { inputTokens: undefined, outputTokens: undefined },
      }),
    });

    await handleAsk(deps, { question: "q" });

    expect(deps.recordUsage).toHaveBeenCalledWith(deps.db, {
      accountId: UUID_ACCOUNT,
      channel: "mcp",
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("skips quota and metering for the non-UUID local-override sentinel", async () => {
    const deps = quotaDeps({ accountId: "local-override" });

    const result = await handleAsk(deps, { question: "q" });

    expect(result.answer).toBe("the answer");
    expect(deps.checkQuota).not.toHaveBeenCalled();
    expect(deps.recordUsage).not.toHaveBeenCalled();
  });

  it("still returns the answer when recordUsage fails", async () => {
    const deps = quotaDeps({
      recordUsage: vi.fn(async () => {
        throw new Error("db down");
      }),
    });

    const result = await handleAsk(deps, { question: "q" });

    expect(result.answer).toBe("the answer");
  });
});

describe("handleForwardQuestion", () => {
  it("forwards a question with no conversationId when omitted (no synthesized FK-violating id)", async () => {
    let forwarded: { question: string; conversationId?: string } | null = null;
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async (_db, input) => {
        forwarded = input;
        return { id: "q-123" } as never;
      },
    };

    const result = await handleForwardQuestion(deps, { question: "Are you open to relocation?" });

    expect(result).toEqual({ ok: true, id: "q-123" });
    expect(forwarded!.question).toBe("Are you open to relocation?");
    // A random UUID here would violate the conversation_id FK (no such
    // conversation row exists). Omitting it stores the question with NULL.
    expect(forwarded!.conversationId).toBeUndefined();
  });

  it("passes through a provided conversationId", async () => {
    let forwarded: { question: string; conversationId?: string } | null = null;
    const convId = "22222222-2222-4222-8222-222222222222";
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async (_db, input) => {
        forwarded = input;
        return { id: "q-456" } as never;
      },
    };

    const result = await handleForwardQuestion(deps, {
      question: "What's your notice period?",
      conversationId: convId,
    });

    expect(result).toEqual({ ok: true, id: "q-456" });
    expect(forwarded!.conversationId).toBe(convId);
  });

  it("rejects an empty question via input validation", async () => {
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async () => ({ id: "x" }) as never,
    };
    await expect(handleForwardQuestion(deps, { question: "" })).rejects.toThrow();
  });
});

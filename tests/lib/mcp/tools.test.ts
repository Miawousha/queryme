import { describe, it, expect } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
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

describe("handleAsk", () => {
  it("generates a conversationId when omitted and returns it", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();
    const deps: AskDeps = {
      db: {} as never,
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async () => "the answer",
    };

    const result = await handleAsk(deps, { question: "What is your experience?" });

    expect(result.answer).toBe("the answer");
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a provided conversationId and reconstructs history from the transcript", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();
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
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async ({ messages }) => {
        seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return "fresh answer";
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
    const kv = new MemoryKv();
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
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async ({ messages }) => {
        seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return "answer";
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

  it("passes sensitive KB text to produceAnswer only when the conversation is unlocked", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();

    let sawSensitive: string | undefined;
    const baseDeps = (unlocked: boolean): AskDeps => ({
      db: {} as never,
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => unlocked,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async ({ sensitiveKbText }) => {
        sawSensitive = sensitiveKbText;
        return "ok";
      },
    });

    sawSensitive = "untouched";
    await handleAsk(baseDeps(false), { question: "q1" });
    expect(sawSensitive).toBeUndefined();

    sawSensitive = "untouched";
    await handleAsk(baseDeps(true), { question: "q2" });
    expect(sawSensitive).toBe("SENSITIVE KB");
  });

  it("rejects an empty question via input validation", async () => {
    const store = makeConversationStore();
    const deps: AskDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async () => "x",
    };

    await expect(handleAsk(deps, { question: "" })).rejects.toThrow();
  });
});

describe("handleForwardQuestion", () => {
  it("forwards a question and returns ok + id, generating a conversationId when omitted", async () => {
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
    expect(forwarded!.conversationId).toMatch(/^[0-9a-f-]{36}$/);
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

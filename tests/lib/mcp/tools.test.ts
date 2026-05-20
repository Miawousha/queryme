import { describe, it, expect } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { handleAsk, handleForwardQuestion } from "@/lib/mcp/tools";
import type { AskDeps, ForwardQuestionDeps } from "@/lib/mcp/tools";
import { handleRequestIdentification, handleVerifyIdentification } from "@/lib/mcp/tools";
import type { RequestIdentificationDeps, VerifyIdentificationDeps } from "@/lib/mcp/tools";

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

describe("handleRequestIdentification", () => {
  const validInput = {
    conversationId: "33333333-3333-4333-8333-333333333333",
    name: "Dana Recruiter",
    company: "Acme Corp",
    workEmail: "dana@acme.com",
    role: "Talent Partner",
    purpose: "Evaluating for a staff role",
  };

  it("calls requestIdentification with mapped args and returns ok on success", async () => {
    let received: unknown = null;
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async (_d, input) => {
        received = input;
        return { ok: true };
      },
      send: async () => {},
    };

    const result = await handleRequestIdentification(deps, validInput);

    expect(result).toEqual({ ok: true });
    expect(received).toEqual({
      conversationId: validInput.conversationId,
      name: validInput.name,
      company: validInput.company,
      workEmail: validInput.workEmail,
      role: validInput.role,
      purpose: validInput.purpose,
    });
  });

  it("maps an invalid_email_domain reason to a descriptive error", async () => {
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async () => ({ ok: false, reason: "invalid_email_domain" }),
      send: async () => {},
    };

    const result = await handleRequestIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/work email/i);
  });

  it("rejects a missing conversationId via input validation", async () => {
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async () => ({ ok: true }),
      send: async () => {},
    };
    const { conversationId, ...withoutConvId } = validInput;
    void conversationId;
    await expect(handleRequestIdentification(deps, withoutConvId)).rejects.toThrow();
  });
});

describe("handleVerifyIdentification", () => {
  const validInput = {
    conversationId: "44444444-4444-4444-8444-444444444444",
    workEmail: "dana@acme.com",
    code: "920742",
  };

  it("calls verifyIdentification with mapped args and returns ok on success", async () => {
    let received: unknown = null;
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async (_d, input) => {
        received = input;
        return { ok: true, token: "tok-abc", askerId: "asker-1" };
      },
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result).toEqual({ ok: true });
    expect(received).toEqual(validInput);
  });

  it("maps a code_invalid reason to a descriptive error", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: false, reason: "code_invalid" }),
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid|expired/i);
  });

  it("maps an asker_not_found reason to a descriptive error", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: false, reason: "asker_not_found" }),
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no matching/i);
  });

  it("rejects a non-6-digit code via input validation", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: true, token: "t", askerId: "a" }),
    };
    await expect(
      handleVerifyIdentification(deps, { ...validInput, code: "12345" }),
    ).rejects.toThrow();
  });
});

import { describe, it, expect, vi } from "vitest";
import { handleForward, type ForwardDeps } from "@/lib/questions/handle-forward";
import { forwardQuestion } from "@/lib/questions/repo";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db/client", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/kv/client", () => ({ getKv: vi.fn(() => ({})) }));
vi.mock("@/lib/kv/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/questions/repo", () => ({
  forwardQuestion: vi.fn(async (_db: unknown, input: { conversationId?: string; question: string; contact?: string }) => ({
    id: "row-id",
    conversationId: input.conversationId ?? null,
    question: input.question,
    contact: input.contact ?? null,
    answeredAt: null,
    createdAt: new Date(),
  })),
}));

function makeReq(body: unknown) {
  return new Request("http://test/api/a/fixture/forward-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function fakeTransport() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    async send(m: { to: string; from: string; subject: string; text: string }) {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: "test" };
    },
  };
}

function deps(transport: ForwardDeps["transport"] = fakeTransport()): ForwardDeps {
  return {
    transport,
    notifyTo: "alex@example.com",
    notifyFrom: "queritae@example.com",
  };
}

describe("handleForward validation", () => {
  it("rejects empty body", async () => {
    const req = new Request("http://test", { method: "POST", body: "" }) as unknown as NextRequest;
    const res = await handleForward(req, deps());
    expect(res.status).toBe(400);
  });

  it("rejects missing question", async () => {
    const res = await handleForward(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }), deps());
    expect(res.status).toBe(400);
  });

  it("rejects empty question", async () => {
    const res = await handleForward(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "",
    }), deps());
    expect(res.status).toBe(400);
  });

  it("rejects oversized question", async () => {
    const res = await handleForward(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "x".repeat(2001),
    }), deps());
    expect(res.status).toBe(400);
  });
});

describe("handleForward — notification side-effect", () => {
  it("fires the email notifier with the question and contact", async () => {
    const t = fakeTransport();
    const req = makeReq({ question: "How does the cache work?", contact: "sarah@acme.example" });
    const res = await handleForward(req, deps(t));
    expect(res.status).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("alex@example.com");
    expect(t.sent[0].text).toContain("How does the cache work?");
    expect(t.sent[0].text).toContain("sarah@acme.example");
    const body = await res.json();
    expect(body.notified).toBe(true);
  });

  it("still saves the question when the conversationId references no conversation (FK violation)", async () => {
    const t = fakeTransport();
    // The first insert (carrying a valid-but-orphan conversationId) trips the
    // conversation_id FK; the handler must retry without the link, not 500.
    // (mockClear zeroes the call count accumulated by earlier tests in this
    // file, which share the module mock.)
    vi.mocked(forwardQuestion)
      .mockClear()
      .mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }))
      .mockResolvedValueOnce({
        id: "row-2", conversationId: null, question: "q", contact: null,
        answeredAt: null, createdAt: new Date(),
      } as never);

    const req = makeReq({ conversationId: "00000000-0000-4000-8000-000000000000", question: "q" });
    const res = await handleForward(req, deps(t));

    expect(res.status).toBe(200);
    const calls = vi.mocked(forwardQuestion).mock.calls;
    expect(calls).toHaveLength(2);
    // The retry dropped the orphan conversationId.
    expect((calls[1][1] as { conversationId?: string }).conversationId).toBeUndefined();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns ok:true even when the transport fails", async () => {
    const failing = {
      async send() {
        throw new Error("network");
      },
    };
    const req = makeReq({ question: "q" });
    const res = await handleForward(req, deps(failing));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notified).toBe(false);
  });
});

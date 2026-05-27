import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/forward-question/route";
import { handleForward } from "@/app/api/forward-question/handler";
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
  return new Request("http://test/api/forward-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/forward-question POST validation", () => {
  it("rejects empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing question", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "x".repeat(2001),
    }));
    expect(res.status).toBe(400);
  });
});

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

describe("handleForward — notification side-effect", () => {
  it("fires the email notifier with the question and contact", async () => {
    const t = fakeTransport();
    const req = makeReq({ question: "How does the cache work?", contact: "sarah@acme.example" });
    const res = await handleForward(req as unknown as NextRequest, {
      transport: t,
      notifyTo: "alex@example.com",
      notifyFrom: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("alex@example.com");
    expect(t.sent[0].text).toContain("How does the cache work?");
    expect(t.sent[0].text).toContain("sarah@acme.example");
    const body = await res.json();
    expect(body.notified).toBe(true);
  });

  it("returns ok:true even when the transport fails", async () => {
    const failing = {
      async send() {
        throw new Error("network");
      },
    };
    const req = makeReq({ question: "q" });
    const res = await handleForward(req as unknown as NextRequest, {
      transport: failing,
      notifyTo: "alex@example.com",
      notifyFrom: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notified).toBe(false);
  });
});

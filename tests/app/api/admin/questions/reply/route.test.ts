import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { handleReply } from "@/app/api/admin/questions/[id]/reply/route";

vi.mock("@/lib/admin/auth", () => ({
  isAdminAuthenticated: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/questions/repo", () => ({
  recordReply: vi.fn(),
  getQuestion: vi.fn(),
}));

import { isAdminAuthenticated } from "@/lib/admin/auth";
import { recordReply, getQuestion } from "@/lib/questions/repo";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/questions/q1/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeTransport() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    async send(m: { to: string; from: string; subject: string; text: string }) {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: "x" };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/questions/[id]/reply", () => {
  it("401s when not admin", async () => {
    vi.mocked(isAdminAuthenticated).mockResolvedValue(false);
    const res = await handleReply(req({ reply: "hi" }), { params: Promise.resolve({ id: "q1" }) }, {
      transport: fakeTransport(),
      from: "queryme@example.com",
    });
    expect(res.status).toBe(401);
  });

  it("400s on empty reply", async () => {
    vi.mocked(isAdminAuthenticated).mockResolvedValue(true);
    const res = await handleReply(req({ reply: "" }), { params: Promise.resolve({ id: "q1" }) }, {
      transport: fakeTransport(),
      from: "queryme@example.com",
    });
    expect(res.status).toBe(400);
  });

  it("persists, then emails the contact when present", async () => {
    vi.mocked(isAdminAuthenticated).mockResolvedValue(true);
    vi.mocked(getQuestion).mockResolvedValue({
      id: "q1",
      question: "Q",
      contact: "sarah@acme.example",
      reply: null,
      answeredAt: null,
      conversationId: null,
      createdAt: new Date(),
    });
    vi.mocked(recordReply).mockResolvedValue({
      id: "q1",
      question: "Q",
      contact: "sarah@acme.example",
      reply: "A",
      answeredAt: new Date(),
      conversationId: null,
      createdAt: new Date(),
    });
    const t = fakeTransport();
    const res = await handleReply(req({ reply: "A" }), { params: Promise.resolve({ id: "q1" }) }, {
      transport: t,
      from: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(recordReply).toHaveBeenCalledWith({}, "q1", "A");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("sarah@acme.example");
    expect(t.sent[0].text).toContain("A");
    const body = await res.json();
    expect(body.emailed).toBe(true);
  });

  it("does not email when there is no contact", async () => {
    vi.mocked(isAdminAuthenticated).mockResolvedValue(true);
    vi.mocked(getQuestion).mockResolvedValue({
      id: "q1", question: "Q", contact: null, reply: null, answeredAt: null,
      conversationId: null, createdAt: new Date(),
    });
    vi.mocked(recordReply).mockResolvedValue({
      id: "q1", question: "Q", contact: null, reply: "A", answeredAt: new Date(),
      conversationId: null, createdAt: new Date(),
    });
    const t = fakeTransport();
    const res = await handleReply(req({ reply: "A" }), { params: Promise.resolve({ id: "q1" }) }, {
      transport: t,
      from: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(t.sent).toHaveLength(0);
    const body = await res.json();
    expect(body.emailed).toBe(false);
  });
});

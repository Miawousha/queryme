import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const resolveAccountAdmin = vi.fn();
const getQuestionAccountId = vi.fn();
const handleReply = vi.fn();

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/questions/account", () => ({ getQuestionAccountId }));
vi.mock("@/app/api/admin/questions/[id]/reply/handler", () => ({ handleReply }));
// The route resolves the persona's name for the reply email; stub the store so
// this routing test stays free of persona/DB infra.
vi.mock("@/lib/persona/store", () => ({
  getPersonaStore: () => ({ ensureReady: async () => {}, getRoot: () => null }),
}));

const ctx = (username: string, id: string) => ({
  params: Promise.resolve({ username, id }),
});
function req(): NextRequest {
  return new NextRequest("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reply: "hi" }),
  });
}

beforeEach(() => {
  resolveAccountAdmin.mockReset();
  getQuestionAccountId.mockReset();
  handleReply.mockReset();
});

describe("POST /api/a/[username]/admin/questions/[id]/reply", () => {
  it("404s when the caller can't administer the account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(404);
    expect(handleReply).not.toHaveBeenCalled();
  });

  it("404s when the question belongs to another account (IDOR guard)", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "acct-a", username: "alex" } });
    getQuestionAccountId.mockResolvedValue("acct-b");
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(404);
    expect(handleReply).not.toHaveBeenCalled();
  });

  it("delegates to handleReply when authorized and owned", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "acct-a", username: "alex" } });
    getQuestionAccountId.mockResolvedValue("acct-a");
    handleReply.mockResolvedValue(new Response(null, { status: 200 }));
    const { POST } = await import("@/app/api/a/[username]/admin/questions/[id]/reply/route");
    const res = await POST(req(), ctx("alex", "q1"));
    expect(res.status).toBe(200);
    expect(handleReply).toHaveBeenCalled();
  });
});

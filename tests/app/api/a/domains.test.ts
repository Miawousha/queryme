import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const resolveAccountAdmin = vi.fn();
const addDomainForAccount = vi.fn();
const listDomainsForAccount = vi.fn();
const removeDomainForAccount = vi.fn();

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/domains/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domains/service")>("@/lib/domains/service");
  return { ...actual, addDomainForAccount, listDomainsForAccount, removeDomainForAccount };
});

const ctx = (username: string) => ({ params: Promise.resolve({ username }) });
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/a/[username]/admin/domains", () => {
  it("404s when caller can't administer the account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { GET } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await GET(new NextRequest("http://x"), ctx("alex"));
    expect(res.status).toBe(404);
  });

  it("returns the account's domains when authorized", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    listDomainsForAccount.mockResolvedValue([{ id: "d1", hostname: "cv.alex.com" }]);
    const { GET } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await GET(new NextRequest("http://x"), ctx("alex"));
    expect(res.status).toBe(200);
    expect((await res.json()).domains).toHaveLength(1);
  });
});

describe("POST /api/a/[username]/admin/domains", () => {
  it("400s a DomainError with its message", async () => {
    const { DomainError } = await import("@/lib/domains/service");
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    addDomainForAccount.mockRejectedValue(new DomainError("invalid", "bad host"));
    const { POST } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await POST(postReq({ hostname: "x" }), ctx("alex"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad host");
  });

  it("201s with the created domain", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: { id: "a", username: "alex" } });
    addDomainForAccount.mockResolvedValue({ id: "d1", hostname: "cv.alex.com" });
    const { POST } = await import("@/app/api/a/[username]/admin/domains/route");
    const res = await POST(postReq({ hostname: "cv.alex.com" }), ctx("alex"));
    expect(res.status).toBe(201);
  });
});

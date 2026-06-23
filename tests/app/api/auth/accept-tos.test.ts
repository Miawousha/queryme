import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSessionAccountId = vi.fn();
const acceptTos = vi.fn();

vi.mock("@/lib/admin/auth", () => ({ getSessionAccountId }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ acceptTos }));

function postReq(form: Record<string, string>): NextRequest {
  const body = new URLSearchParams(form).toString();
  return new NextRequest("http://localhost/api/auth/accept-tos", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/accept-tos", () => {
  it("stamps acceptance and redirects to a safe returnTo", async () => {
    getSessionAccountId.mockResolvedValue("acct-1");
    acceptTos.mockResolvedValue({ id: "acct-1", username: "octocat" });
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "/octocat/admin" }));
    expect(acceptTos).toHaveBeenCalledWith({}, "acct-1");
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/octocat/admin");
  });

  it("ignores a hostile returnTo and falls back to the user's admin", async () => {
    getSessionAccountId.mockResolvedValue("acct-1");
    acceptTos.mockResolvedValue({ id: "acct-1", username: "octocat" });
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "https://evil.com" }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/octocat/admin");
  });

  it("redirects to login when there is no session", async () => {
    getSessionAccountId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/accept-tos/route");
    const res = await POST(postReq({ returnTo: "/x" }));
    expect(acceptTos).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/api/auth/github/login");
  });
});

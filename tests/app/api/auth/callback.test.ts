import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createState } from "@/lib/auth/oauth-state";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";

const exchangeCodeForToken = vi.fn();
const fetchGitHubUser = vi.fn();
const upsertAccountFromGitHub = vi.fn();

vi.mock("@/lib/auth/github", () => ({ exchangeCodeForToken, fetchGitHubUser }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ upsertAccountFromGitHub }));

const SECRET = "test-session-secret";

function callbackReq(params: Record<string, string>, cookieState?: string): NextRequest {
  const u = new URL("http://localhost/api/auth/github/callback");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (cookieState) headers.cookie = `queryme_oauth_state=${cookieState}`;
  return new NextRequest(u, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = SECRET;
});

describe("GET /api/auth/github/callback", () => {
  it("provisions an account and sets the session cookie on success", async () => {
    const state = createState(SECRET);
    exchangeCodeForToken.mockResolvedValue("tok");
    fetchGitHubUser.mockResolvedValue({ id: 42, login: "octocat" });
    upsertAccountFromGitHub.mockResolvedValue({ id: "acct-1", username: "octocat" });

    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackReq({ code: "c", state }, state));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/octocat/admin");
    expect(res.headers.get("set-cookie")).toContain("queryme_session=");
    expect(upsertAccountFromGitHub).toHaveBeenCalledWith({}, { githubId: "42", login: "octocat" });
  });

  it("redirects to the error page on state mismatch", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackReq({ code: "c", state: "x" }, "y"));
    expect(res.headers.get("location")).toContain("/auth/error?reason=bad_state");
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("maps denied consent and reserved/conflict provisioning errors", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");

    const denied = await GET(callbackReq({ error: "access_denied" }));
    expect(denied.headers.get("location")).toContain("reason=denied");

    const state = createState(SECRET);
    exchangeCodeForToken.mockResolvedValue("tok");
    fetchGitHubUser.mockResolvedValue({ id: 7, login: "api" });
    upsertAccountFromGitHub.mockRejectedValueOnce(new ReservedLoginError("api"));
    const reserved = await GET(callbackReq({ code: "c", state }, state));
    expect(reserved.headers.get("location")).toContain("reason=reserved");

    upsertAccountFromGitHub.mockRejectedValueOnce(new SlugConflictError("octocat"));
    const state2 = createState(SECRET);
    const conflict = await GET(callbackReq({ code: "c", state: state2 }, state2));
    expect(conflict.headers.get("location")).toContain("reason=conflict");
  });
});

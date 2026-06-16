import { describe, it, expect, beforeEach, vi } from "vitest";

function mockSession(account: unknown) {
  vi.doMock("@/lib/accounts/guard", () => ({ requireSessionAccount: async () => account }));
}

async function get() {
  const { GET } = await import("@/app/api/github/app/callback/route");
  return GET(new Request("http://localhost/api/github/app/callback?installation_id=42&setup_action=install"));
}

describe("GET /api/github/app/callback", () => {
  beforeEach(() => vi.resetModules());

  it("redirects a logged-in user to their admin content page", async () => {
    mockSession({ id: "a1", username: "alex" });
    const res = await get();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/alex/admin/settings/content?app=installed",
    );
  });

  it("redirects to login when there is no session", async () => {
    mockSession(null);
    const res = await get();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/api/auth/github/login");
  });
});

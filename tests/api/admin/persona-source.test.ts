import { describe, it, expect, beforeEach, vi } from "vitest";

const ROUTE_TEST_ACCOUNT_ID = "route-test-account-id";

describe("GET /api/admin/persona-source", () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock resolveRootAccountId to return a stable test value.
    vi.doMock("@/lib/accounts/root", () => ({
      resolveRootAccountId: async () => ROUTE_TEST_ACCOUNT_ID,
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => false,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns { active: null, history: [] } when no persona is configured", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    vi.doMock("@/lib/persona-source", () => ({
      getActivePersonaSourceRowForAccount: async () => null,
      listSyncHistoryForAccount: async () => [],
      syncFromGitHubForAccount: vi.fn(),
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ active: null, history: [] });
  });

  it("returns the active row and the history list", async () => {
    const fakeActive = {
      id: "some-uuid",
      repoUrl: "https://github.com/alex/queryme-content",
      branch: "main",
      commitSha: "aaa1111111111111111111111111111111111111",
      status: "ok" as const,
      error: null,
      accountId: ROUTE_TEST_ACCOUNT_ID,
      syncedAt: new Date(),
    };
    const fakeHistory = [
      fakeActive,
      {
        id: "other-uuid",
        repoUrl: "https://github.com/alex/queryme-content",
        branch: "main",
        commitSha: "bbb2222222222222222222222222222222222222",
        status: "error" as const,
        error: "missing kb/profile.yaml",
        accountId: ROUTE_TEST_ACCOUNT_ID,
        syncedAt: new Date(),
      },
    ];
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    vi.doMock("@/lib/persona-source", () => ({
      getActivePersonaSourceRowForAccount: async () => fakeActive,
      listSyncHistoryForAccount: async () => fakeHistory,
      syncFromGitHubForAccount: vi.fn(),
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.active.commitSha).toBe("aaa1111111111111111111111111111111111111");
    expect(body.history).toHaveLength(2);
  });
});

import { FAKE_SHA } from "../../lib/__mocks__/github-handlers";

describe("POST /api/admin/persona-source", () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock resolveRootAccountId to return a stable test value.
    vi.doMock("@/lib/accounts/root", () => ({
      resolveRootAccountId: async () => ROUTE_TEST_ACCOUNT_ID,
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => false,
    }));
    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when repoUrl is missing", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("repoUrl");
  });

  it("triggers a sync and returns the new row info", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    vi.doMock("@/lib/persona-source", () => ({
      getActivePersonaSourceRowForAccount: async () => null,
      listSyncHistoryForAccount: async () => [],
      syncFromGitHubForAccount: async () => ({
        kind: "ok",
        commitSha: FAKE_SHA,
        syncedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commitSha).toBe(FAKE_SHA);
  });

  it("returns 400 with the error message when sync fails", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    vi.doMock("@/lib/persona-source", () => ({
      getActivePersonaSourceRowForAccount: async () => null,
      listSyncHistoryForAccount: async () => [],
      syncFromGitHubForAccount: async () => ({
        kind: "error",
        message: "missing required file(s): kb/skills.yaml",
      }),
    }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("kb/skills.yaml");
  });
});

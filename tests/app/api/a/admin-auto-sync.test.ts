import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ACCOUNT = { id: "acct-1", username: "alex" };

function mockAuth(ok = true) {
  vi.doMock("@/app/[username]/admin/resolve", () => ({
    resolveAccountAdmin: async () =>
      ok ? { kind: "ok", account: ACCOUNT } : { kind: "not-found" },
  }));
}

const repo = {
  getAutoSyncConfig: vi.fn(),
  enableAutoSync: vi.fn(),
  disableAutoSync: vi.fn(),
};

function mockRepo() {
  vi.doMock("@/lib/auto-sync/repo", () => repo);
}

async function callGet() {
  const { GET } = await import("@/app/api/a/[username]/admin/auto-sync/route");
  return GET(new Request("http://localhost"), { params: Promise.resolve({ username: "alex" }) });
}

async function callPost(action: unknown) {
  const { POST } = await import("@/app/api/a/[username]/admin/auto-sync/route");
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return POST(req, { params: Promise.resolve({ username: "alex" }) });
}

describe("/api/a/[username]/admin/auto-sync", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(repo).forEach((f) => f.mockReset());
  });
  // GITHUB_APP_SLUG is read by appInstallUrl(); clear it after each test so a
  // test that sets it can't leak the install URL into later tests.
  afterEach(() => {
    delete process.env.GITHUB_APP_SLUG;
  });

  it("GET 404s when not authorized", async () => {
    mockAuth(false);
    mockRepo();
    expect((await callGet()).status).toBe(404);
  });

  it("POST 404s when not authorized and mutates nothing", async () => {
    mockAuth(false);
    mockRepo();
    expect((await callPost("enable")).status).toBe(404);
    expect(repo.enableAutoSync).not.toHaveBeenCalled();
  });

  it("GET returns the App-connected view", async () => {
    process.env.GITHUB_APP_SLUG = "queritae";
    mockAuth();
    mockRepo();
    repo.getAutoSyncConfig.mockResolvedValue({
      enabled: true,
      secret: "deadbeef",
      lastDeliveryAt: null,
      installationId: "inst-9",
    });
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      configured: true,
      lastDeliveryAt: null,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
  });

  it("GET reports not-configured when no row exists", async () => {
    mockAuth();
    mockRepo();
    repo.getAutoSyncConfig.mockResolvedValue(null);
    const body = await (await callGet()).json();
    expect(body).toMatchObject({ enabled: false, configured: false, connectedViaApp: false, manageUrl: null });
  });

  it("POST enable calls enableAutoSync and returns the view", async () => {
    mockAuth();
    mockRepo();
    repo.enableAutoSync.mockResolvedValue({ enabled: true, lastDeliveryAt: null });
    const res = await callPost("enable");
    expect(res.status).toBe(200);
    expect(repo.enableAutoSync).toHaveBeenCalledWith("acct-1");
    expect(await res.json()).toMatchObject({ enabled: true, configured: true });
  });

  it("POST disable calls disableAutoSync", async () => {
    mockAuth();
    mockRepo();
    repo.disableAutoSync.mockResolvedValue({ enabled: false, lastDeliveryAt: null });
    const res = await callPost("disable");
    expect(repo.disableAutoSync).toHaveBeenCalledWith("acct-1");
    expect(await res.json()).toMatchObject({ enabled: false, configured: true });
  });

  it("POST 400s on an unknown action", async () => {
    mockAuth();
    mockRepo();
    expect((await callPost("frobnicate")).status).toBe(400);
  });
});

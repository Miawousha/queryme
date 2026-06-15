import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const ACCOUNT = { id: "acct-1", username: "alex", status: "active" };
const SECRET = "s".repeat(64);
const ACTIVE = { repoUrl: "https://github.com/alex/content", branch: "main", commitSha: "abc" };

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const syncSpy = vi.fn(async () => ({ kind: "ok", commitSha: "abc", syncedAt: new Date() }));
const activeSpy = vi.fn(async () => ACTIVE as unknown);
const afterCbs: Array<() => unknown> = [];

function mockDeps(opts: { account?: unknown; config?: unknown; active?: unknown } = {}) {
  vi.doMock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server");
    return { ...actual, after: (cb: () => unknown) => afterCbs.push(cb) };
  });
  vi.doMock("@/lib/accounts/load", () => ({
    loadAccountForSlug: async () => ("account" in opts ? opts.account : ACCOUNT),
  }));
  vi.doMock("@/lib/auto-sync/repo", () => ({
    getAutoSyncConfig: async () =>
      "config" in opts ? opts.config : { accountId: "acct-1", enabled: true, secret: SECRET },
    touchLastDelivery: vi.fn(async () => {}),
  }));
  vi.doMock("@/lib/persona-source", () => ({
    getActivePersonaSourceRowForAccount: activeSpy.mockImplementation(async () =>
      "active" in opts ? opts.active : ACTIVE,
    ),
    syncFromGitHubForAccount: syncSpy,
  }));
}

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import("@/app/api/a/[username]/sync-webhook/route");
  const req = new Request("http://localhost/api/a/alex/sync-webhook", {
    method: "POST",
    headers,
    body,
  });
  return POST(req, { params: Promise.resolve({ username: "alex" }) });
}

describe("POST /api/a/[username]/sync-webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    syncSpy.mockClear();
    activeSpy.mockClear();
    afterCbs.length = 0;
  });

  it("syncs the STORED source on a verified push to the stored branch", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main", repository: { full_name: "attacker/evil" } });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    // Stored repo+branch used, payload repo IGNORED.
    expect(syncSpy).toHaveBeenCalledWith("acct-1", ACTIVE.repoUrl, ACTIVE.branch);
  });

  it("rejects an invalid signature with 401 and never syncs", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body, "wrong-secret"),
    });
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, { "x-github-event": "push" });
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("pongs a verified ping without syncing", async () => {
    mockDeps();
    const body = JSON.stringify({ zen: "hi", hook_id: 1 });
    const res = await post(body, {
      "x-github-event": "ping",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pong: true });
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a verified push to a different branch", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/dev" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips when auto-sync is disabled", async () => {
    mockDeps({ config: { accountId: "acct-1", enabled: false, secret: SECRET } });
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("404s when the account is unknown", async () => {
    mockDeps({ account: null });
    const res = await post("{}", { "x-github-event": "push" });
    expect(res.status).toBe(404);
  });

  it("404s when no auto-sync config exists", async () => {
    mockDeps({ config: null });
    const res = await post("{}", { "x-github-event": "push" });
    expect(res.status).toBe(404);
  });

  it("still acks 200 when the background sync rejects", async () => {
    mockDeps();
    syncSpy.mockRejectedValueOnce(new Error("sync boom"));
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body),
    });
    expect(res.status).toBe(200);
    // Draining the after() callbacks must not throw out of the route.
    for (const cb of afterCbs) await Promise.resolve(cb()).catch(() => {});
    expect(syncSpy).toHaveBeenCalled();
  });

  it("does not reach the active-source lookup on an invalid signature", async () => {
    mockDeps();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await post(body, {
      "x-github-event": "push",
      "x-hub-signature-256": sign(body, "wrong-secret"),
    });
    expect(res.status).toBe(401);
    expect(activeSpy).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

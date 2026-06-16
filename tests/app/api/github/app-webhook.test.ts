import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "s".repeat(64);
const ACCOUNT = { id: "acct-1", username: "alex", githubId: "99" };
const ACTIVE = { repoUrl: "https://github.com/alex/content", branch: "main", commitSha: "abc" };

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

const syncSpy = vi.fn(async () => ({ kind: "ok", commitSha: "abc", syncedAt: new Date() }));
const connectSpy = vi.fn(async () => {});
const disconnectSpy = vi.fn(async () => {});
const touchSpy = vi.fn(async () => {});
const afterCbs: Array<() => unknown> = [];

function mockDeps(opts: {
  account?: unknown;
  installationAccountId?: string | null;
  config?: unknown;
  active?: unknown;
} = {}) {
  vi.doMock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server");
    return { ...actual, after: (cb: () => unknown) => afterCbs.push(cb) };
  });
  vi.doMock("@/lib/db/client", () => ({ getDb: () => ({}) }));
  vi.doMock("@/lib/accounts/repo", () => ({
    getAccountByGithubId: async () => ("account" in opts ? opts.account : ACCOUNT),
  }));
  vi.doMock("@/lib/github-app/repo", () => ({
    findAccountIdByInstallation: async () =>
      "installationAccountId" in opts ? opts.installationAccountId : ACCOUNT.id,
    connectInstallation: connectSpy,
    disconnectInstallation: disconnectSpy,
  }));
  vi.doMock("@/lib/auto-sync/repo", () => ({
    getAutoSyncConfig: async () => ("config" in opts ? opts.config : { enabled: true }),
    touchLastDelivery: touchSpy,
  }));
  vi.doMock("@/lib/persona-source", async () => ({
    getActivePersonaSourceRowForAccount: async () => ("active" in opts ? opts.active : ACTIVE),
    syncFromGitHubForAccount: syncSpy,
    parseGitHubRepoUrl: (
      await vi.importActual<typeof import("@/lib/persona-source")>("@/lib/persona-source")
    ).parseGitHubRepoUrl,
  }));
}

async function post(event: string, payload: object, opts?: { secret?: string; noSig?: boolean }) {
  const { POST } = await import("@/app/api/github/app/route");
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "x-github-event": event };
  if (!opts?.noSig) headers["x-hub-signature-256"] = sign(body, opts?.secret ?? SECRET);
  const req = new Request("http://localhost/api/github/app", { method: "POST", headers, body });
  return POST(req);
}

describe("POST /api/github/app", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
    [syncSpy, connectSpy, disconnectSpy, touchSpy].forEach((s) => s.mockClear());
    afterCbs.length = 0;
  });

  it("connects + first-syncs on installation.created with a single repo", async () => {
    mockDeps();
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 99 },
      repositories: [{ full_name: "alex/content" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).toHaveBeenCalledWith("acct-1", "42");
    for (const cb of afterCbs) await cb();
    expect(syncSpy).toHaveBeenCalledWith("acct-1", "https://github.com/alex/content", "main");
  });

  it("connects but does NOT sync on a multi-repo install", async () => {
    mockDeps();
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 99 },
      repositories: [{ full_name: "alex/a" }, { full_name: "alex/b" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).toHaveBeenCalled();
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("acks an unmatched install without connecting", async () => {
    mockDeps({ account: null });
    const res = await post("installation", {
      action: "created",
      installation: { id: 42 },
      sender: { id: 12345 },
      repositories: [{ full_name: "x/y" }],
    });
    expect(res.status).toBe(200);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("disconnects on installation.deleted", async () => {
    mockDeps();
    const res = await post("installation", { action: "deleted", installation: { id: 42 } });
    expect(res.status).toBe(200);
    expect(disconnectSpy).toHaveBeenCalledWith("42");
  });

  it("syncs the stored source on a matching push", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    expect(touchSpy).toHaveBeenCalledWith("acct-1");
    for (const cb of afterCbs) await cb();
    expect(syncSpy).toHaveBeenCalledWith("acct-1", ACTIVE.repoUrl, ACTIVE.branch);
  });

  it("skips a push to a different branch", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/dev",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push for a repo that isn't the configured source", async () => {
    mockDeps();
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/somethingelse" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push from an unknown installation", async () => {
    mockDeps({ installationAccountId: null });
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 999 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("skips a push when auto-sync is disabled", async () => {
    mockDeps({ config: { enabled: false } });
    const res = await post("push", {
      ref: "refs/heads/main",
      installation: { id: 42 },
      repository: { full_name: "alex/content" },
    });
    expect(res.status).toBe(200);
    for (const cb of afterCbs) await cb();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("pongs a ping", async () => {
    mockDeps();
    const res = await post("ping", { zen: "hi", installation: { id: 42 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pong: true });
  });

  it("rejects an invalid signature with 401", async () => {
    mockDeps();
    const res = await post(
      "push",
      { ref: "refs/heads/main", installation: { id: 42 }, repository: { full_name: "alex/content" } },
      { secret: "wrong-secret" },
    );
    expect(res.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("500s when the app secret is unset", async () => {
    mockDeps();
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    const res = await post("ping", { installation: { id: 1 } }, { noSig: true });
    expect(res.status).toBe(500);
  });
});

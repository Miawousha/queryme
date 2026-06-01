import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer } from "@/vitest.setup";
import { run } from "@/scripts/lib/admin-run";

// ---------------------------------------------------------------------------
// Module mocks for account create (avoid real DB calls)
// ---------------------------------------------------------------------------

const fakeDb = {} as ReturnType<typeof import("@/lib/db/client").getDb>;

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => fakeDb),
}));

const mockCreateAccount = vi.fn();
const mockGetAccountBySlug = vi.fn();

vi.mock("@/lib/accounts/repo", () => ({
  createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  getAccountBySlug: (...args: unknown[]) => mockGetAccountBySlug(...args),
}));

const BASE = "https://deployed.example.com";
const PIPED = { isTTY: false };

function json(stdout: string) {
  return JSON.parse(stdout);
}

describe("run: help", () => {
  it("returns the manifest as a success envelope (exit 0)", async () => {
    const { exitCode, stdout } = await run(["help"], { env: {}, ...PIPED });
    expect(exitCode).toBe(0);
    const env = json(stdout);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("help");
    expect(env.result.commands.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["sync", "status", "migrate", "help"]),
    );
  });

  it("defaults to help when no command is given", async () => {
    const { exitCode, stdout } = await run([], { env: {}, ...PIPED });
    expect(exitCode).toBe(0);
    expect(json(stdout).command).toBe("help");
  });
});

describe("run: usage errors (exit 2)", () => {
  it("rejects an unknown command", async () => {
    const { exitCode, stdout } = await run(["frob"], { env: {}, ...PIPED });
    expect(exitCode).toBe(2);
    expect(json(stdout)).toMatchObject({ ok: false });
    expect(json(stdout).error).toMatch(/unknown command/i);
  });

  it("rejects migrate --remote", async () => {
    const { exitCode, stdout } = await run(["migrate", "--remote", BASE], { env: {}, ...PIPED });
    expect(exitCode).toBe(2);
    expect(json(stdout).error).toMatch(/migrate targets the database/i);
  });
});

describe("run: remote status", () => {
  it("logs in and returns active+history (exit 0)", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ ok: true }, { headers: { "Set-Cookie": "queryme_admin=tok; Path=/" } }),
      ),
      http.get(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ active: { commitSha: "s1" }, history: [] }),
      ),
    );
    const { exitCode, stdout } = await run(["status", "--remote", BASE], {
      env: { ADMIN_PASSWORD: "pw" },
      ...PIPED,
    });
    expect(exitCode).toBe(0);
    expect(json(stdout).result).toMatchObject({ mode: "remote", active: { commitSha: "s1" } });
  });

  it("fails (exit 1) with a hint when no password is available", async () => {
    const { exitCode, stdout } = await run(["status", "--remote", BASE], { env: {}, ...PIPED });
    expect(exitCode).toBe(1);
    expect(json(stdout)).toMatchObject({ ok: false });
    expect(json(stdout).hint).toMatch(/ADMIN_PASSWORD|remote-password/i);
  });

  it("maps a 401 login to exit 1 with the incorrect-password error", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () => HttpResponse.json({ error: "no" }, { status: 401 })),
    );
    const { exitCode, stdout } = await run(["status", "--remote", BASE], {
      env: { ADMIN_PASSWORD: "wrong" },
      ...PIPED,
    });
    expect(exitCode).toBe(1);
    expect(json(stdout).error).toMatch(/incorrect admin password/i);
  });
});

describe("run: remote sync", () => {
  it("syncs and reports changed=true (exit 0)", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ ok: true }, { headers: { "Set-Cookie": "queryme_admin=tok; Path=/" } }),
      ),
      http.get(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ active: { commitSha: "old", repoUrl: "https://github.com/a/b", branch: "main" }, history: [] }),
      ),
      http.post(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ commitSha: "new", syncedAt: "2026-05-29T00:00:00Z" }),
      ),
    );
    const { exitCode, stdout } = await run(["sync", "--remote", BASE], {
      env: { ADMIN_PASSWORD: "pw" },
      ...PIPED,
    });
    expect(exitCode).toBe(0);
    expect(json(stdout).result).toMatchObject({
      mode: "remote",
      changed: true,
      commitSha: "new",
      previousSha: "old",
    });
  });

  it("remote dry-run never POSTs and reports the would-be sha", async () => {
    let posted = false;
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ ok: true }, { headers: { "Set-Cookie": "queryme_admin=tok; Path=/" } }),
      ),
      http.get(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ active: { commitSha: "old", repoUrl: "https://github.com/a/b", branch: "main" }, history: [] }),
      ),
      http.get("https://api.github.com/repos/a/b/commits/main", () => HttpResponse.json({ sha: "fresh" })),
      http.post(`${BASE}/api/admin/persona-source`, () => {
        posted = true;
        return HttpResponse.json({ commitSha: "x", syncedAt: "z" });
      }),
    );
    const { exitCode, stdout } = await run(["sync", "--remote", BASE, "--dry-run"], {
      env: { ADMIN_PASSWORD: "pw" },
      ...PIPED,
    });
    expect(exitCode).toBe(0);
    expect(posted).toBe(false);
    expect(json(stdout).result).toMatchObject({ dryRun: true, changed: true, commitSha: "fresh", previousSha: "old" });
  });
});

describe("run: account create (happy path)", () => {
  beforeEach(() => {
    mockCreateAccount.mockReset();
    mockGetAccountBySlug.mockReset();
  });

  it("creates an account and returns ok (exit 0)", async () => {
    const fakeAccount = { id: "acc-uuid-1", username: "alexcollet", githubId: null, createdAt: new Date() };
    mockCreateAccount.mockResolvedValue(fakeAccount);

    const out = await run(["account", "create", "alexcollet", "--json"], { env: { POSTGRES_URL: "x" }, isTTY: false });
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout)).toMatchObject({ ok: true });
    expect(mockCreateAccount).toHaveBeenCalledWith(fakeDb, { username: "alexcollet" });
  });

  it("returns usage-error (exit 2) when no username is given", async () => {
    const out = await run(["account", "create"], { env: { POSTGRES_URL: "x" }, isTTY: false });
    expect(out.exitCode).toBe(2);
  });
});

describe("run: --verbose on unexpected errors", () => {
  function handlersWithFailingGitHub() {
    return [
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ ok: true }, { headers: { "Set-Cookie": "queryme_admin=tok; Path=/" } }),
      ),
      http.get(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ active: { commitSha: "old", repoUrl: "https://github.com/a/b", branch: "main" }, history: [] }),
      ),
      http.get("https://api.github.com/repos/a/b/commits/main", () => new HttpResponse(null, { status: 500 })),
    ];
  }

  it("omits the stack without --verbose (just the message)", async () => {
    mswServer.use(...handlersWithFailingGitHub());
    const { exitCode, stdout } = await run(["sync", "--remote", BASE, "--dry-run"], {
      env: { ADMIN_PASSWORD: "pw" },
      ...PIPED,
    });
    expect(exitCode).toBe(1);
    expect(json(stdout).error).toBe("GitHub commits API returned 500");
  });

  it("includes the stack with --verbose", async () => {
    mswServer.use(...handlersWithFailingGitHub());
    const { exitCode, stdout } = await run(["sync", "--remote", BASE, "--dry-run", "--verbose"], {
      env: { ADMIN_PASSWORD: "pw" },
      ...PIPED,
    });
    expect(exitCode).toBe(1);
    expect(json(stdout).error).toMatch(/GitHub commits API returned 500/);
    expect(json(stdout).error).toMatch(/\n\s+at /);
  });
});

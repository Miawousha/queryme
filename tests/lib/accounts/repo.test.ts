import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createAccount,
  getAccountBySlug,
  getAccountById,
  getRootAccount,
  getAccountByGithubId,
  upsertAccountFromGitHub,
  setAccountRole,
  listAllAccounts,
} from "@/lib/accounts/repo";
import { ReservedLoginError, SlugConflictError } from "@/lib/accounts/errors";

// Pure validation runs without a DB: createAccount throws before any DB call.
describe("createAccount validation", () => {
  it("rejects invalid/reserved usernames before touching the DB", async () => {
    const fakeDb = {} as never;
    await expect(createAccount(fakeDb, { username: "admin" })).rejects.toThrow(/invalid/i);
    await expect(createAccount(fakeDb, { username: "has space" })).rejects.toThrow(/invalid/i);
  });

  it("rejects a reserved GitHub login in upsert before any DB call", async () => {
    const fakeDb = {} as never;
    await expect(
      upsertAccountFromGitHub(fakeDb, { githubId: "1", login: "admin" }),
    ).rejects.toBeInstanceOf(ReservedLoginError);
  });
});

// Real DB round-trips: opt-in only, so they never hit the developer's live DB.
const RUN_DB = !!process.env.RUN_DB_TESTS;
const d = RUN_DB ? describe : describe.skip;

d("accounts/repo (integration)", () => {
  const db = getDb();
  const username = `test-acct-${Date.now()}`;
  let createdId: string;

  afterAll(async () => {
    if (createdId) await db.delete(accounts).where(eq(accounts.id, createdId));
  });

  it("creates an account and reads it back by slug and id", async () => {
    const acct = await createAccount(db, { username });
    createdId = acct.id;
    expect(acct.username).toBe(username);
    const bySlug = await getAccountBySlug(db, username);
    expect(bySlug?.id).toBe(acct.id);
    const byId = await getAccountById(db, acct.id);
    expect(byId?.username).toBe(username);
  });

  it("resolves the root account from ROOT_ACCOUNT_USERNAME", async () => {
    const prev = process.env.ROOT_ACCOUNT_USERNAME;
    process.env.ROOT_ACCOUNT_USERNAME = username;
    try {
      const root = await getRootAccount(db);
      expect(root?.username).toBe(username);
    } finally {
      process.env.ROOT_ACCOUNT_USERNAME = prev;
    }
  });

  const extraIds: string[] = [];
  afterAll(async () => {
    for (const id of extraIds) await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("upsert: creates, then claims a github_id-null account, then conflicts", async () => {
    const login = `up-${Date.now()}`;
    // create path
    const created = await upsertAccountFromGitHub(db, { githubId: `gh-${login}`, login });
    extraIds.push(created.id);
    expect(created.username).toBe(login);
    expect(created.githubId).toBe(`gh-${login}`);
    // Self-serve signups are active immediately (no waitlist gate).
    expect(created.status).toBe("active");

    // returning path: same github_id resolves the same row
    const again = await upsertAccountFromGitHub(db, { githubId: `gh-${login}`, login });
    expect(again.id).toBe(created.id);

    // claim path: a CLI-created (github_id null) account is adopted
    const cliLogin = `cli-${Date.now()}`;
    const cli = await createAccount(db, { username: cliLogin });
    extraIds.push(cli.id);
    expect(cli.githubId).toBeNull();
    const claimed = await upsertAccountFromGitHub(db, { githubId: `gh-${cliLogin}`, login: cliLogin });
    expect(claimed.id).toBe(cli.id);
    expect(claimed.githubId).toBe(`gh-${cliLogin}`);

    // conflict path: same slug, different github_id
    await expect(
      upsertAccountFromGitHub(db, { githubId: "someone-else", login: cliLogin }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it("getAccountByGithubId resolves a created account", async () => {
    const login = `byid-${Date.now()}`;
    const a = await createAccount(db, { username: login, githubId: `g-${login}` });
    extraIds.push(a.id);
    const found = await getAccountByGithubId(db, `g-${login}`);
    expect(found?.id).toBe(a.id);
    expect(await getAccountByGithubId(db, "no-such-id")).toBeNull();
  });

  it("setAccountRole flips a role and listAllAccounts reports it", async () => {
    const login = `role-${Date.now()}`;
    const a = await createAccount(db, { username: login });
    extraIds.push(a.id);
    expect(a.role).toBe("user");
    const promoted = await setAccountRole(db, login, "admin");
    expect(promoted.role).toBe("admin");
    const all = await listAllAccounts(db);
    const summary = all.find((s) => s.username === login);
    expect(summary).toBeDefined();
    expect(summary?.role).toBe("admin");
    expect(summary?.repoLinked).toBe(false);
    expect(summary?.conversationCount).toBe(0);
  });
});

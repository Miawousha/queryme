import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createAccount,
  getAccountBySlug,
  getAccountById,
  getRootAccount,
} from "@/lib/accounts/repo";

// Pure validation runs without a DB: createAccount throws before any DB call.
describe("createAccount validation", () => {
  it("rejects invalid/reserved usernames before touching the DB", async () => {
    const fakeDb = {} as never;
    await expect(createAccount(fakeDb, { username: "admin" })).rejects.toThrow(/invalid/i);
    await expect(createAccount(fakeDb, { username: "has space" })).rejects.toThrow(/invalid/i);
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
});

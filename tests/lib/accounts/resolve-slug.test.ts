import { describe, it, expect, vi } from "vitest";
import { resolveAccountSlug } from "@/lib/accounts/repo";

describe("resolveAccountSlug", () => {
  it("returns null for a reserved slug without touching the DB", async () => {
    const db = { select: vi.fn(() => { throw new Error("DB must not be queried"); }) } as never;
    expect(await resolveAccountSlug(db, "admin")).toBeNull();
  });
  it("delegates to getAccountBySlug for a normal slug", async () => {
    // Build a minimal fake db whose select().from().where().limit() resolves to one row.
    const row = { id: "id-1", username: "alexcollet", githubId: null, createdAt: new Date() };
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
    } as never;
    const acct = await resolveAccountSlug(db, "alexcollet");
    expect(acct?.username).toBe("alexcollet");
  });
});

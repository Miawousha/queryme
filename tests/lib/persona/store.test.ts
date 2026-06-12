import { describe, it, expect } from "vitest";
import { getPersonaStore } from "@/lib/persona/store";
import { getPersonaRootForAccount } from "@/lib/persona-source";

describe("PersonaStore (filesystem) under PERSONA_LOCAL_OVERRIDE", () => {
  it("getRoot returns the override fixture for any account id", () => {
    const store = getPersonaStore();
    expect(store.getRoot("acct-a")).toBe(process.env.PERSONA_LOCAL_OVERRIDE);
    expect(store.getRoot("acct-b")).toBe(process.env.PERSONA_LOCAL_OVERRIDE);
  });
  it("getPersonaRootForAccount matches the store", () => {
    expect(getPersonaRootForAccount("acct-a")).toBe(process.env.PERSONA_LOCAL_OVERRIDE);
  });
});

// DB-path tests: only run when RUN_DB_TESTS is set (not set in CI or local dev)
const d = process.env.RUN_DB_TESTS ? describe : describe.skip;

d("PersonaStore (filesystem) — DB paths", () => {
  // account_id is a uuid column — a valid-but-absent uuid, not a slug.
  const NONEXISTENT_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";

  it("getActivePersonaSourceRowForAccount returns null when no row exists", async () => {
    const { getActivePersonaSourceRowForAccount } = await import("@/lib/persona-source");
    const row = await getActivePersonaSourceRowForAccount(NONEXISTENT_ACCOUNT_ID);
    expect(row).toBeNull();
  });

  it("listSyncHistoryForAccount returns empty array when no rows exist", async () => {
    const { listSyncHistoryForAccount } = await import("@/lib/persona-source");
    const rows = await listSyncHistoryForAccount(NONEXISTENT_ACCOUNT_ID);
    expect(rows).toEqual([]);
  });
});

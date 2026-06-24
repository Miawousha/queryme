import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { resolveAccountAdmin, loadAccountForSlug } = vi.hoisted(() => ({
  resolveAccountAdmin: vi.fn(),
  loadAccountForSlug: vi.fn(),
}));

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));

import { resolveAccountAdminViaSessionOrToken } from "@/lib/admin/setup-token-guard";
import { createSetupToken } from "@/lib/admin/setup-token";

const ACCT = { id: "22222222-2222-2222-2222-222222222222", username: "ada" };

function reqWith(token?: string): Request {
  return new Request("https://x.test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("resolveAccountAdminViaSessionOrToken", () => {
  let _originalSessionSecret: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    _originalSessionSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "s3cr3t";
  });
  afterEach(() => {
    if (_originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = _originalSessionSecret;
    }
  });

  it("returns the session resolution when a session is present", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith());
    expect(res).toEqual({ kind: "ok", account: ACCT });
    expect(loadAccountForSlug).not.toHaveBeenCalled();
  });

  it("accepts a valid setup token for the slug account when no session", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    loadAccountForSlug.mockResolvedValue(ACCT);
    const token = createSetupToken(ACCT.id, Date.now() + 60_000, "s3cr3t");
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith(token));
    expect(res).toEqual({ kind: "ok", account: ACCT });
  });

  it("rejects a token minted for a different account", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    loadAccountForSlug.mockResolvedValue(ACCT);
    const token = createSetupToken("99999999-9999-9999-9999-999999999999", Date.now() + 60_000, "s3cr3t");
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith(token));
    expect(res).toEqual({ kind: "login" });
  });

  it("falls back to the session resolution when there is no bearer token", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    const res = await resolveAccountAdminViaSessionOrToken("ada", reqWith());
    expect(res).toEqual({ kind: "login" });
  });
});

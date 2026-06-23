import { describe, it, expect, vi, beforeEach } from "vitest";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/accounts/guard")>()),
  requireSessionAccount,
}));

function acct(over: Record<string, unknown>) {
  return { id: "s1", username: "u", role: "user", status: "active", plan: "free", createdAt: new Date(), tosAcceptedAt: new Date(), ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveAccountAdmin ToS gate", () => {
  it("returns needs-tos for an active session that hasn't accepted", async () => {
    loadAccountForSlug.mockResolvedValue(acct({ id: "t1", username: "u" }));
    requireSessionAccount.mockResolvedValue(acct({ id: "t1", username: "u", tosAcceptedAt: null }));
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect((await resolveAccountAdmin("u")).kind).toBe("needs-tos");
  });

  it("returns ok once the session has accepted", async () => {
    loadAccountForSlug.mockResolvedValue(acct({ id: "t1", username: "u" }));
    requireSessionAccount.mockResolvedValue(acct({ id: "t1", username: "u", tosAcceptedAt: new Date() }));
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect((await resolveAccountAdmin("u")).kind).toBe("ok");
  });
});

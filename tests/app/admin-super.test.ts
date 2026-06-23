// tests/app/admin-super.test.ts — the super console gate
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSuperAdmin = vi.fn();
const listAllAccounts = vi.fn();

vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSuperAdmin };
});
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ listAllAccounts }));

beforeEach(() => {
  requireSuperAdmin.mockReset();
  listAllAccounts.mockReset();
});

describe("loadSuperConsole", () => {
  it("returns forbidden for non-super callers", async () => {
    requireSuperAdmin.mockResolvedValue(null);
    const { loadSuperConsole } = await import("@/app/admin/load");
    expect((await loadSuperConsole()).kind).toBe("forbidden");
  });
  it("returns the account list for a super-admin", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "a", role: "admin", status: "active", tosAcceptedAt: new Date() });
    listAllAccounts.mockResolvedValue([{ username: "x", role: "user" }]);
    const { loadSuperConsole } = await import("@/app/admin/load");
    const result = await loadSuperConsole();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.accounts).toHaveLength(1);
  });
  it("returns needs-tos for an active super-admin that hasn't accepted", async () => {
    requireSuperAdmin.mockResolvedValue({ id: "a", role: "admin", status: "active", tosAcceptedAt: null });
    const { loadSuperConsole } = await import("@/app/admin/load");
    expect((await loadSuperConsole()).kind).toBe("needs-tos");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSessionAccount };
});

beforeEach(() => {
  loadAccountForSlug.mockReset();
  requireSessionAccount.mockReset();
});

describe("resolveAccountAdmin", () => {
  it("returns notFound for an unknown slug", async () => {
    loadAccountForSlug.mockResolvedValue(null);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("nope")).toEqual({ kind: "not-found" });
  });
  it("returns login-required without a session", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue(null);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "login" });
  });
  it("returns not-found for a logged-in stranger", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "b", username: "bob", role: "user" });
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "not-found" });
  });
  it("returns ok for the owner and for a super-admin", async () => {
    const acct = { id: "a", username: "alex", role: "user" };
    loadAccountForSlug.mockResolvedValue(acct);
    requireSessionAccount.mockResolvedValue(acct);
    const { resolveAccountAdmin } = await import("@/app/[username]/admin/resolve");
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "ok", account: acct });

    requireSessionAccount.mockResolvedValue({ id: "z", username: "z", role: "admin" });
    expect(await resolveAccountAdmin("alex")).toEqual({ kind: "ok", account: acct });
  });
});

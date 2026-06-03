import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccountAdmin = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("next/navigation", () => ({ notFound, redirect }));

beforeEach(() => {
  resolveAccountAdmin.mockReset();
  notFound.mockClear();
  redirect.mockClear();
});

describe("requireAdminAccount", () => {
  it("returns the account when the gate resolves ok", async () => {
    const account = { id: "a", username: "alex", role: "user" };
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    expect(await requireAdminAccount("alex")).toEqual(account);
  });
  it("calls notFound for an unknown / forbidden slug", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    await expect(requireAdminAccount("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
  it("redirects to GitHub login when unauthenticated", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    await expect(requireAdminAccount("alex")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/api/auth/github/login");
  });
});

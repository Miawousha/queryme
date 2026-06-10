import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionAccountId, getAccountById, getRootAccount } = vi.hoisted(() => ({
  getSessionAccountId: vi.fn(),
  getAccountById: vi.fn(),
  getRootAccount: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getSessionAccountId }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ getAccountById, getRootAccount }));

import {
  canAdminister,
  requireSessionAccount,
  requireSuperAdmin,
  requireRootAdmin,
} from "@/lib/accounts/guard";

const user = { id: "u1", username: "u", githubId: null, role: "user", status: "active", createdAt: new Date() } as const;
const other = { id: "u2", username: "o", githubId: null, role: "user", status: "active", createdAt: new Date() } as const;
const admin = { id: "a1", username: "a", githubId: null, role: "admin", status: "active", createdAt: new Date() } as const;
const root = { id: "r1", username: "root", githubId: null, role: "user", status: "active", createdAt: new Date() } as const;

beforeEach(() => {
  getSessionAccountId.mockReset();
  getAccountById.mockReset();
  getRootAccount.mockReset();
});

describe("canAdminister", () => {
  it("allows the owner and any super-admin, denies strangers and anonymous", () => {
    expect(canAdminister(user, user)).toBe(true);
    expect(canAdminister(admin, other)).toBe(true);
    expect(canAdminister(user, other)).toBe(false);
    expect(canAdminister(null, user)).toBe(false);
  });
});

describe("requireSessionAccount / requireSuperAdmin / requireRootAdmin", () => {
  it("returns null without a session", async () => {
    getSessionAccountId.mockResolvedValue(null);
    expect(await requireSessionAccount()).toBeNull();
    expect(await requireSuperAdmin()).toBeNull();
    expect(await requireRootAdmin()).toBeNull();
  });

  it("requireSuperAdmin only passes role=admin", async () => {
    getSessionAccountId.mockResolvedValue("u1");
    getAccountById.mockResolvedValue(user);
    expect(await requireSuperAdmin()).toBeNull();
    getSessionAccountId.mockResolvedValue("a1");
    getAccountById.mockResolvedValue(admin);
    expect(await requireSuperAdmin()).toEqual(admin);
  });

  it("requireRootAdmin passes the root owner and super-admins, denies others", async () => {
    getRootAccount.mockResolvedValue(root);
    getSessionAccountId.mockResolvedValue("r1");
    getAccountById.mockResolvedValue(root);
    expect(await requireRootAdmin()).toEqual(root);

    getSessionAccountId.mockResolvedValue("a1");
    getAccountById.mockResolvedValue(admin);
    expect(await requireRootAdmin()).toEqual(admin);

    getSessionAccountId.mockResolvedValue("u1");
    getAccountById.mockResolvedValue(user);
    expect(await requireRootAdmin()).toBeNull();
  });
});

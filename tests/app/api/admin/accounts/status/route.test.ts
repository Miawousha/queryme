import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/accounts/[username]/status/route";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/accounts/guard", () => ({
  requireSuperAdmin: vi.fn(),
  needsTosAcceptance: vi.fn((acct) => acct.status === "active" && acct.tosAcceptedAt == null),
}));
vi.mock("@/lib/accounts/repo", () => ({
  getAccountBySlug: vi.fn(),
  setAccountStatus: vi.fn(),
}));

import { requireSuperAdmin, needsTosAcceptance } from "@/lib/accounts/guard";
import { getAccountBySlug, setAccountStatus } from "@/lib/accounts/repo";

const superAdmin = { id: "su-1", username: "root", role: "admin", status: "active", tosAcceptedAt: new Date() } as Account;

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "acct-1",
    username: "alex",
    githubId: "42",
    role: "user",
    status: "waitlisted",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  } as Account;
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/accounts/alex/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(username: string) {
  return { params: Promise.resolve({ username }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ROOT_ACCOUNT_USERNAME = "root";
});

describe("POST /api/admin/accounts/[username]/status", () => {
  it("403s when there is no super-admin session", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(null);
    const res = await POST(req({ status: "active" }), params("alex"));
    expect(res.status).toBe(403);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("403s when the super-admin is active but has not accepted the ToS", async () => {
    const unaccepted = { id: "su-2", username: "root", role: "admin", status: "active", tosAcceptedAt: null } as Account;
    vi.mocked(requireSuperAdmin).mockResolvedValue(unaccepted);
    const res = await POST(req({ status: "active" }), params("alex"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Terms acceptance required");
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    const res = await POST(req("not json"), params("alex"));
    expect(res.status).toBe(400);
  });

  it("400s on an unknown status value", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    const res = await POST(req({ status: "frozen" }), params("alex"));
    expect(res.status).toBe(400);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("400s when demoting the root account from active", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    const res = await POST(req({ status: "disabled" }), params("root"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/root account/i);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("allows setting the root account to active", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    vi.mocked(getAccountBySlug).mockResolvedValue(account({ username: "root", status: "active" }));
    vi.mocked(setAccountStatus).mockResolvedValue(account({ username: "root", status: "active" }));
    const res = await POST(req({ status: "active" }), params("root"));
    expect(res.status).toBe(200);
  });

  it("404s on an unknown account", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    vi.mocked(getAccountBySlug).mockResolvedValue(null);
    const res = await POST(req({ status: "active" }), params("ghost"));
    expect(res.status).toBe(404);
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("updates the status and returns the account summary", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue(superAdmin);
    vi.mocked(getAccountBySlug).mockResolvedValue(account());
    vi.mocked(setAccountStatus).mockResolvedValue(account({ status: "active" }));

    const res = await POST(req({ status: "active" }), params("alex"));
    expect(res.status).toBe(200);
    expect(setAccountStatus).toHaveBeenCalledWith({}, "alex", "active");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.account).toMatchObject({ username: "alex", status: "active", role: "user" });
  });
});

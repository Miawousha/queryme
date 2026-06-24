import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveAccountAdmin, checkRateLimit } = vi.hoisted(() => ({
  resolveAccountAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("@/lib/kv/client", () => ({ getKv: () => ({}) }));
vi.mock("@/lib/kv/rate-limit", () => ({ checkRateLimit }));

import { POST } from "@/app/api/a/[username]/admin/setup-token/route";
import { verifySetupToken } from "@/lib/admin/setup-token";

const ACCT = { id: "33333333-3333-3333-3333-333333333333", username: "ada" };
const ctx = { params: Promise.resolve({ username: "ada" }) };
const post = () => POST(new Request("https://x.test", { method: "POST" }), ctx);

describe("POST setup-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "s3cr3t";
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("mints a verifiable token for the session owner", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(verifySetupToken(body.token, Date.now(), "s3cr3t")).toBe(ACCT.id);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("404s without a session", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    expect((await post()).status).toBe(404);
  });

  it("429s when rate-limited", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account: ACCT });
    checkRateLimit.mockResolvedValue({ allowed: false });
    expect((await post()).status).toBe(429);
  });
});

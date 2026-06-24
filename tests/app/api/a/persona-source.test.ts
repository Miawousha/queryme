import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSetupToken } from "@/lib/admin/setup-token";

const loadAccountForSlug = vi.fn();
const requireSessionAccount = vi.fn();
const personaSourceSync = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/accounts/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts/guard")>(
    "@/lib/accounts/guard",
  );
  return { ...actual, requireSessionAccount };
});
vi.mock("@/lib/admin/persona-source-api", () => ({
  personaSourceStatus: async () => ({ active: null, history: [] }),
  personaSourceSync,
}));

const params = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  loadAccountForSlug.mockReset();
  requireSessionAccount.mockReset();
  personaSourceSync.mockReset();
});

describe("GET /api/a/[username]/admin/persona-source", () => {
  it("404s for an unknown account", async () => {
    loadAccountForSlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("nope"));
    expect(res.status).toBe(404);
  });
  it("404s for a logged-in stranger", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "b", username: "bob", role: "user" });
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("alex"));
    expect(res.status).toBe(404);
  });
  it("returns status for the owner", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    requireSessionAccount.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    const { GET } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await GET(new Request("http://x"), params("alex"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: null, history: [] });
  });
});

describe("POST /api/a/[username]/admin/persona-source", () => {
  it("authorizes via a setup-token bearer when there is no session", async () => {
    process.env.SESSION_SECRET = "s3cr3t";
    // No session → resolveAccountAdmin returns { kind: "login" }, so the guard
    // falls through to the bearer-token path.
    requireSessionAccount.mockResolvedValue(null);
    loadAccountForSlug.mockResolvedValue({ id: "a", username: "alex", role: "user" });
    personaSourceSync.mockResolvedValue({ kind: "ok", commitSha: "deadbeef", syncedAt: "now" });

    const token = createSetupToken("a", Date.now() + 60_000, "s3cr3t");
    const req = new Request("https://x.test/api/a/alex/admin/persona-source", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ repoUrl: "https://github.com/alex/cv" }),
    });
    const { POST } = await import("@/app/api/a/[username]/admin/persona-source/route");
    const res = await POST(req, params("alex"));
    expect(res.status).toBe(200);
    expect(personaSourceSync).toHaveBeenCalledWith("a", "https://github.com/alex/cv", undefined);
  });
});

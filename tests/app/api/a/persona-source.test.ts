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
vi.mock("@/lib/admin/persona-source-api", () => ({
  personaSourceStatus: async () => ({ active: null, history: [] }),
  personaSourceSync: vi.fn(),
}));

const params = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  loadAccountForSlug.mockReset();
  requireSessionAccount.mockReset();
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

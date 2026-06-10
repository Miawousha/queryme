import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const loadActiveAccountForSlug = vi.fn();
const loadCvKb = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadActiveAccountForSlug }));
vi.mock("@/lib/cv/load", () => ({
  loadCvKb,
  parseCvLang: (value: string | string[] | null | undefined) =>
    (Array.isArray(value) ? value[0] : value) === "fr" ? "fr" : "en",
}));

const ctx = (username: string) => ({ params: Promise.resolve({ username }) });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/a/[username]/cv", () => {
  it("404s for an unknown account slug", async () => {
    loadActiveAccountForSlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/nope/cv"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(loadCvKb).not.toHaveBeenCalled();
  });

  it("returns the account-scoped cvKb for a known slug", async () => {
    loadActiveAccountForSlug.mockResolvedValue({ id: "acc-1", username: "alex" });
    loadCvKb.mockResolvedValue({ root: "/x", cvKb: { projects: [] } });
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/alex/cv?lang=fr"), ctx("alex"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lang).toBe("fr");
    expect(body.kb).toEqual({ projects: [] });
    expect(loadCvKb).toHaveBeenCalledWith("acc-1", "fr");
  });

  it("503s when the account has no configured content", async () => {
    loadActiveAccountForSlug.mockResolvedValue({ id: "acc-1", username: "alex" });
    loadCvKb.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/alex/cv"), ctx("alex"));
    expect(res.status).toBe(503);
  });
});

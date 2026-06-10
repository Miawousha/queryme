import { describe, it, expect, vi, beforeEach } from "vitest";

const listAllAccounts = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ listAllAccounts }));

beforeEach(() => vi.clearAllMocks());

describe("sitemap", () => {
  it("includes per-account URLs for repo-linked, active accounts only", async () => {
    listAllAccounts.mockResolvedValue([
      { username: "alex", repoLinked: true, status: "active" },
      { username: "ghost", repoLinked: false, status: "active" },
      { username: "pending", repoLinked: true, status: "waitlisted" },
    ]);
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/alex/cv"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/alex"))).toBe(true);
    expect(urls.some((u) => u.includes("/ghost"))).toBe(false);
    expect(urls.some((u) => u.includes("/pending"))).toBe(false);
  });

  it("falls back to static entries when the DB is unavailable", async () => {
    listAllAccounts.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/cv"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/about"))).toBe(true);
  });
});

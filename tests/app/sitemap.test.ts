import { describe, it, expect, vi, beforeEach } from "vitest";

const listAllAccounts = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ listAllAccounts }));

beforeEach(() => vi.clearAllMocks());

describe("sitemap", () => {
  it("includes per-account CV URLs for repo-linked accounts only", async () => {
    listAllAccounts.mockResolvedValue([
      { username: "alex", repoLinked: true },
      { username: "ghost", repoLinked: false },
    ]);
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/alex/cv"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/alex"))).toBe(true);
    expect(urls.some((u) => u.includes("/ghost"))).toBe(false);
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

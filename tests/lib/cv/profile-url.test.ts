import { describe, it, expect, vi, beforeEach } from "vitest";

const listDomainsByAccount = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/domains/repo", () => ({ listDomainsByAccount }));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PERSONA_LOCAL_OVERRIDE;
  process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com";
});

describe("resolveProfileUrl", () => {
  it("prefers an active custom domain over a pending one", async () => {
    listDomainsByAccount.mockResolvedValue([
      { hostname: "pending.alex.com", status: "pending" },
      { hostname: "cv.alex.com", status: "active" },
    ]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://cv.alex.com");
  });

  it("picks the first active domain when several are active", async () => {
    listDomainsByAccount.mockResolvedValue([
      { hostname: "first.alex.com", status: "active" },
      { hostname: "second.alex.com", status: "active" },
    ]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://first.alex.com");
  });

  it("falls back to the platform URL with username when no domain is active", async () => {
    listDomainsByAccount.mockResolvedValue([{ hostname: "pending.alex.com", status: "pending" }]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
  });

  it("falls back to the bare site origin when no username is given (root account)", async () => {
    listDomainsByAccount.mockResolvedValue([]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "root" })).toBe("https://queritae.com");
  });

  it("short-circuits to the fallback under PERSONA_LOCAL_OVERRIDE without touching the DB", async () => {
    process.env.PERSONA_LOCAL_OVERRIDE = "1";
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
    expect(listDomainsByAccount).not.toHaveBeenCalled();
  });

  it("fails open to the fallback when the domains lookup throws", async () => {
    listDomainsByAccount.mockRejectedValue(new Error("db down"));
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
  });
});

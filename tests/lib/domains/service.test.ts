import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/domains/repo");
vi.mock("@/lib/domains/vercel", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/domains/vercel")>();
  return {
    ...actual,
    vercelDomains: {
      add: vi.fn(),
      get: vi.fn(),
      config: vi.fn(),
      verify: vi.fn(),
      remove: vi.fn(),
    },
  };
});
vi.mock("@/lib/domains/edge-cache");

import * as repo from "@/lib/domains/repo";
import { vercelDomains, VercelApiError } from "@/lib/domains/vercel";
import { setDomainSlug, delDomainSlug } from "@/lib/domains/edge-cache";
import {
  addDomainForAccount,
  refreshStatus,
  removeDomainForAccount,
  DomainError,
  MAX_DOMAINS_PER_ACCOUNT,
} from "@/lib/domains/service";

const db = {} as any;
const account = { id: "acct-a", username: "alex" } as any;
const baseRow = {
  id: "d1",
  accountId: "acct-a",
  hostname: "cv.alex.com",
  status: "pending",
  verification: null,
  lastError: null,
  createdAt: new Date(),
  verifiedAt: null,
  lastCheckedAt: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_HOST = "queryme.app";
});

describe("addDomainForAccount", () => {
  it("rejects an invalid hostname before touching Vercel", async () => {
    await expect(addDomainForAccount(db, account, "alex.com")).rejects.toBeInstanceOf(DomainError);
    expect(vercelDomains.add).not.toHaveBeenCalled();
  });

  it("rejects when the per-account limit is reached", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(MAX_DOMAINS_PER_ACCOUNT);
    await expect(addDomainForAccount(db, account, "cv.alex.com")).rejects.toMatchObject({ reason: "limit" });
    expect(vercelDomains.add).not.toHaveBeenCalled();
  });

  it("rejects a hostname already taken", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(0);
    vi.mocked(repo.getDomainByHostname).mockResolvedValue(baseRow);
    await expect(addDomainForAccount(db, account, "cv.alex.com")).rejects.toMatchObject({ reason: "taken" });
  });

  it("attaches to Vercel and inserts a pending row", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(0);
    vi.mocked(repo.getDomainByHostname).mockResolvedValue(null);
    vi.mocked(vercelDomains.add).mockResolvedValue({ name: "cv.alex.com", verified: false });
    vi.mocked(repo.insertDomain).mockResolvedValue(baseRow);
    const out = await addDomainForAccount(db, account, " CV.alex.com ");
    expect(vercelDomains.add).toHaveBeenCalledWith("cv.alex.com");
    expect(out.instructions).toEqual({ type: "CNAME", name: "cv", value: "cname.vercel-dns.com" });
  });

  it("maps Vercel domain_already_in_use to a taken error", async () => {
    vi.mocked(repo.countDomainsByAccount).mockResolvedValue(0);
    vi.mocked(repo.getDomainByHostname).mockResolvedValue(null);
    vi.mocked(vercelDomains.add).mockRejectedValue(
      new VercelApiError("domain_already_in_use", "taken"),
    );
    await expect(addDomainForAccount(db, account, "cv.alex.com")).rejects.toMatchObject({
      reason: "taken",
    });
    expect(repo.insertDomain).not.toHaveBeenCalled();
  });
});

describe("refreshStatus", () => {
  it("activates and writes the KV slug when verified + configured", async () => {
    vi.mocked(vercelDomains.get).mockResolvedValue({ name: "cv.alex.com", verified: true });
    vi.mocked(vercelDomains.config).mockResolvedValue({ misconfigured: false });
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "active" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("active");
    expect(setDomainSlug).toHaveBeenCalledWith("cv.alex.com", "alex");
  });

  it("stays pending and clears the KV slug when not yet configured", async () => {
    vi.mocked(vercelDomains.get).mockResolvedValue({ name: "cv.alex.com", verified: false });
    vi.mocked(vercelDomains.config).mockResolvedValue({ misconfigured: true });
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "pending" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("pending");
    expect(delDomainSlug).toHaveBeenCalledWith("cv.alex.com");
  });

  it("marks error when Vercel throws", async () => {
    vi.mocked(vercelDomains.get).mockRejectedValue(new VercelApiError("boom", "nope"));
    vi.mocked(repo.updateDomain).mockResolvedValue({ ...baseRow, status: "error", lastError: "nope" });
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("error");
  });

  it("never throws even when the error-path DB update also fails", async () => {
    vi.mocked(vercelDomains.get).mockRejectedValue(new VercelApiError("boom", "nope"));
    vi.mocked(repo.updateDomain).mockRejectedValue(new Error("db down"));
    const out = await refreshStatus(db, baseRow, "alex");
    expect(out.status).toBe("pending"); // falls back to the original row
  });
});

describe("removeDomainForAccount", () => {
  it("rejects a domain owned by another account", async () => {
    vi.mocked(repo.getDomainById).mockResolvedValue({ ...baseRow, accountId: "acct-b" });
    await expect(removeDomainForAccount(db, account, "d1")).rejects.toBeInstanceOf(DomainError);
    expect(repo.deleteDomain).not.toHaveBeenCalled();
  });

  it("removes from Vercel, DB, and KV", async () => {
    vi.mocked(repo.getDomainById).mockResolvedValue(baseRow);
    await removeDomainForAccount(db, account, "d1");
    expect(vercelDomains.remove).toHaveBeenCalledWith("cv.alex.com");
    expect(repo.deleteDomain).toHaveBeenCalledWith(db, "d1");
    expect(delDomainSlug).toHaveBeenCalledWith("cv.alex.com");
  });

  it("still cleans up DB + KV when Vercel remove throws a VercelApiError", async () => {
    vi.mocked(repo.getDomainById).mockResolvedValue(baseRow);
    vi.mocked(vercelDomains.remove).mockRejectedValue(new VercelApiError("not_found", "gone"));
    await removeDomainForAccount(db, account, "d1");
    expect(repo.deleteDomain).toHaveBeenCalledWith(db, "d1");
    expect(delDomainSlug).toHaveBeenCalledWith("cv.alex.com");
  });
});

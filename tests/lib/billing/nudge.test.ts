import { describe, it, expect, vi } from "vitest";
import { maybeSendUpgradeNudge, type NudgeDeps } from "@/lib/billing/nudge";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

function makeDeps(overrides: Partial<NudgeDeps> = {}): NudgeDeps {
  return {
    db: {} as never,
    claimNudge: vi.fn(async () => true),
    getAccountById: vi.fn(async () => ({ id: ACCOUNT_ID, username: "alex" }) as never),
    ownerNotifyAddress: vi.fn(async () => "owner@example.com"),
    transport: { send: vi.fn(async () => ({ id: "email-1" })) },
    from: "noreply@queritae.com",
    siteUrl: "https://queritae.com",
    ...overrides,
  };
}

describe("maybeSendUpgradeNudge", () => {
  it("sends once when the month is claimed", async () => {
    const deps = makeDeps();
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date("2026-06-11T12:00:00Z"));
    expect(deps.claimNudge).toHaveBeenCalledWith(deps.db, ACCOUNT_ID, "2026-06");
    expect(vi.mocked(deps.transport.send)).toHaveBeenCalledOnce();
    const msg = vi.mocked(deps.transport.send).mock.calls[0][0];
    expect(msg.to).toBe("owner@example.com");
    expect(msg.text).toContain("https://queritae.com/alex/admin/settings/billing");
  });

  it("does nothing when the month was already claimed", async () => {
    const deps = makeDeps({ claimNudge: vi.fn(async () => false) });
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date());
    expect(vi.mocked(deps.transport.send)).not.toHaveBeenCalled();
  });

  it("does nothing when there is no recipient address", async () => {
    const deps = makeDeps({ ownerNotifyAddress: vi.fn(async () => "") });
    await maybeSendUpgradeNudge(deps, ACCOUNT_ID, new Date());
    expect(vi.mocked(deps.transport.send)).not.toHaveBeenCalled();
  });
});

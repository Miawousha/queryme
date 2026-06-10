import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmailMessage } from "@/lib/notify/email";

const getDailyUsageByAccount = vi.fn();
const sent: EmailMessage[] = [];

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/usage/repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage/repo")>();
  return { ...actual, getDailyUsageByAccount };
});
// Mock only the transport — the real sendUsageAlert composes the email so the
// tests exercise the actual subject/body.
vi.mock("@/lib/notify/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notify/email")>();
  return {
    ...actual,
    resendTransport: () => ({
      async send(msg: EmailMessage) {
        sent.push(msg);
        return { id: "test-id" };
      },
    }),
  };
});

const SECRET = "test-cron-secret";

function req(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/usage-alert", { headers }) as never;
}

/** The route alerts on the completed (previous) UTC day. */
function yesterdayUtc(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  process.env.CRON_SECRET = SECRET;
  process.env.USAGE_ALERT_TO = "ops@example.com";
  process.env.FORWARD_NOTIFICATION_FROM = "alerts@queritae.example";
  delete process.env.USAGE_ALERT_DAILY_TOKENS;
  delete process.env.FORWARD_NOTIFICATION_TO;
});

describe("GET /api/cron/usage-alert", () => {
  it("401s without an Authorization header", async () => {
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getDailyUsageByAccount).not.toHaveBeenCalled();
  });

  it("401s with the wrong bearer token", async () => {
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(getDailyUsageByAccount).not.toHaveBeenCalled();
  });

  it("401s when CRON_SECRET is unset — fails closed", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(getDailyUsageByAccount).not.toHaveBeenCalled();
  });

  it("reports totals without emailing when spend is below the threshold", async () => {
    getDailyUsageByAccount.mockResolvedValue([
      { accountId: "a1", username: "dana", messages: 12, tokens: 400_000 },
      { accountId: "a2", username: "erik", messages: 3, tokens: 100_000 },
    ]);
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      day: yesterdayUtc(),
      totalMessages: 15,
      totalTokens: 500_000,
      alerted: false,
    });
    expect(sent).toHaveLength(0);
  });

  it("emails the alert with day and top account when spend crosses the threshold", async () => {
    getDailyUsageByAccount.mockResolvedValue([
      { accountId: "a1", username: "dana", messages: 40, tokens: 900_000 },
      { accountId: "a2", username: "erik", messages: 10, tokens: 200_000 },
    ]);
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      day: yesterdayUtc(),
      totalMessages: 50,
      totalTokens: 1_100_000,
      alerted: true,
    });
    expect(getDailyUsageByAccount).toHaveBeenCalledWith({}, yesterdayUtc());
    expect(sent).toHaveLength(1);
    const msg = sent[0];
    expect(msg.to).toBe("ops@example.com");
    expect(msg.from).toBe("alerts@queritae.example");
    expect(msg.subject).toContain(yesterdayUtc());
    expect(msg.text).toContain(yesterdayUtc());
    expect(msg.text).toContain("1100000 tokens");
    expect(msg.text).toContain("dana: 40 messages, 900000 tokens");
  });

  it("honours the USAGE_ALERT_DAILY_TOKENS override", async () => {
    process.env.USAGE_ALERT_DAILY_TOKENS = "1000";
    getDailyUsageByAccount.mockResolvedValue([
      { accountId: "a1", username: "dana", messages: 1, tokens: 1_500 },
    ]);
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect((await res.json()).alerted).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("falls back to FORWARD_NOTIFICATION_TO when USAGE_ALERT_TO is unset", async () => {
    delete process.env.USAGE_ALERT_TO;
    process.env.FORWARD_NOTIFICATION_TO = "fallback@example.com";
    getDailyUsageByAccount.mockResolvedValue([
      { accountId: "a1", username: "dana", messages: 1, tokens: 2_000_000 },
    ]);
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(sent[0].to).toBe("fallback@example.com");
  });

  it("500s with JSON when the usage query fails", async () => {
    getDailyUsageByAccount.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/cron/usage-alert/route");
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "db down" });
    expect(sent).toHaveLength(0);
  });
});

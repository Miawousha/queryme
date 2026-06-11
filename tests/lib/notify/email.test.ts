import { describe, it, expect, vi } from "vitest";
import { sendForwardNotification, sendUpgradeNudge, type EmailTransport } from "@/lib/notify/email";

function makeTransport(): EmailTransport & { sent: Parameters<EmailTransport["send"]>[0][] } {
  const sent: Parameters<EmailTransport["send"]>[0][] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
      return { id: "test-id" };
    },
  };
}

describe("sendForwardNotification", () => {
  it("emails the configured recipient with the question and contact", async () => {
    const t = makeTransport();
    await sendForwardNotification(t, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "What's the cache hit rate at Maxwell?",
      contact: "sarah@acme.example",
      conversationId: "11111111-1111-1111-1111-111111111111",
    });
    expect(t.sent).toHaveLength(1);
    const msg = t.sent[0];
    expect(msg.to).toBe("alex@example.com");
    expect(msg.from).toBe("queryme@example.com");
    expect(msg.subject).toMatch(/forwarded question/i);
    expect(msg.text).toContain("What's the cache hit rate at Maxwell?");
    expect(msg.text).toContain("sarah@acme.example");
    expect(msg.text).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("omits the contact line when none was provided", async () => {
    const t = makeTransport();
    await sendForwardNotification(t, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "Plain question",
      contact: null,
      conversationId: null,
    });
    expect(t.sent[0].text).not.toMatch(/contact/i);
  });

  it("does not throw when the transport rejects — it returns ok:false", async () => {
    const failing: EmailTransport = {
      async send() {
        throw new Error("network");
      },
    };
    const r = await sendForwardNotification(failing, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "q",
      contact: null,
      conversationId: null,
    });
    expect(r).toEqual({ ok: false, error: "network" });
  });
});

describe("sendUpgradeNudge", () => {
  it("sends the upgrade email with the billing link", async () => {
    const t = makeTransport();
    const result = await sendUpgradeNudge(t, {
      to: "owner@example.com",
      from: "noreply@queritae.com",
      username: "alex",
      freeAllowance: 10,
      billingUrl: "https://queritae.com/alex/admin/settings/billing",
    });
    expect(result).toEqual({ ok: true, id: "test-id" });
    expect(t.sent[0].subject).toContain("free questions");
    expect(t.sent[0].text).toContain("https://queritae.com/alex/admin/settings/billing");
    expect(t.sent[0].text).toContain("10");
  });
});

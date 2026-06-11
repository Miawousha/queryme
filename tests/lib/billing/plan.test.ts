import { describe, it, expect } from "vitest";
import {
  planFromSubscriptionStatus,
  subscriptionPeriodEnd,
  subscriptionCustomerId,
  FREE_MONTHLY_ANSWERS,
} from "@/lib/billing/plan";

describe("planFromSubscriptionStatus", () => {
  it("maps paying-or-grace statuses to pro", () => {
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("trialing")).toBe("pro");
    // past_due keeps Pro through Stripe's smart-retry window: a recruiter
    // conversation must not die because a card expired yesterday.
    expect(planFromSubscriptionStatus("past_due")).toBe("pro");
  });

  it("maps terminal or unpaid statuses to free", () => {
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus("unpaid")).toBe("free");
    expect(planFromSubscriptionStatus("incomplete")).toBe("free");
    expect(planFromSubscriptionStatus("incomplete_expired")).toBe("free");
  });

  it("fails closed on null/undefined/garbage", () => {
    expect(planFromSubscriptionStatus(null)).toBe("free");
    expect(planFromSubscriptionStatus(undefined)).toBe("free");
    expect(planFromSubscriptionStatus("definitely_not_a_status")).toBe("free");
  });
});

describe("subscriptionPeriodEnd", () => {
  it("prefers the item-level period end (Stripe API 2025+), epoch seconds → Date", () => {
    const sub = { items: { data: [{ current_period_end: 1_780_000_000 }] } };
    expect(subscriptionPeriodEnd(sub)?.toISOString()).toBe(
      new Date(1_780_000_000 * 1000).toISOString(),
    );
  });

  it("falls back to the subscription-level field (older API versions)", () => {
    expect(subscriptionPeriodEnd({ current_period_end: 1_780_000_000 })).toEqual(
      new Date(1_780_000_000 * 1000),
    );
  });

  it("returns null when absent", () => {
    expect(subscriptionPeriodEnd({})).toBeNull();
  });
});

describe("subscriptionCustomerId", () => {
  it("handles string and expanded-object customers", () => {
    expect(subscriptionCustomerId({ customer: "cus_123" })).toBe("cus_123");
    expect(subscriptionCustomerId({ customer: { id: "cus_456" } })).toBe("cus_456");
  });
});

describe("FREE_MONTHLY_ANSWERS", () => {
  it("is the spec'd allowance", () => {
    expect(FREE_MONTHLY_ANSWERS).toBe(10);
  });
});

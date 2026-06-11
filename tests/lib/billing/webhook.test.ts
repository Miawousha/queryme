import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
import { handleStripeWebhook, type WebhookDeps } from "@/lib/billing/webhook";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy_key_never_used_for_network");

function signedRequest(event: object): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, signature };
}

function makeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db: {} as never,
    constructEvent: (payload, sig) => stripe.webhooks.constructEvent(payload, sig, SECRET),
    retrieveSubscription: vi.fn(async () => ({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      items: { data: [{ current_period_end: 1_780_000_000 }] },
    })),
    applySubscriptionState: vi.fn(async () => {}),
    findAccountIdByCustomer: vi.fn(async () => null),
    ...overrides,
  };
}

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

describe("handleStripeWebhook", () => {
  it("rejects a missing or invalid signature with 400", async () => {
    const deps = makeDeps();
    expect((await handleStripeWebhook(deps, "{}", null)).status).toBe(400);
    expect((await handleStripeWebhook(deps, "{}", "t=1,v1=bogus")).status).toBe(400);
    expect(deps.applySubscriptionState).not.toHaveBeenCalled();
  });

  it("checkout.session.completed retrieves the subscription and applies state", async () => {
    const deps = makeDeps();
    const { payload, signature } = signedRequest({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          mode: "subscription",
          client_reference_id: ACCOUNT_ID,
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(deps.db, {
      accountId: ACCOUNT_ID,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(1_780_000_000 * 1000),
    });
  });

  it("subscription.updated resolves the account from metadata", async () => {
    const deps = makeDeps();
    const { payload, signature } = signedRequest({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          customer: "cus_1",
          metadata: { accountId: ACCOUNT_ID },
          items: { data: [{ current_period_end: 1_780_000_000 }] },
        },
      },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ accountId: ACCOUNT_ID, subscriptionStatus: "past_due" }),
    );
  });

  it("subscription.deleted falls back to the customer-id lookup", async () => {
    const deps = makeDeps({ findAccountIdByCustomer: vi.fn(async () => ACCOUNT_ID) });
    const { payload, signature } = signedRequest({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", status: "canceled", customer: "cus_1" } },
    });
    const res = await handleStripeWebhook(deps, payload, signature);
    expect(res.status).toBe(200);
    expect(deps.findAccountIdByCustomer).toHaveBeenCalledWith(deps.db, "cus_1");
    expect(deps.applySubscriptionState).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ accountId: ACCOUNT_ID, subscriptionStatus: "canceled" }),
    );
  });

  it("acknowledges unmapped accounts and unknown event types without applying", async () => {
    const deps = makeDeps(); // findAccountIdByCustomer → null
    const sub = signedRequest({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_x", status: "active", customer: "cus_unknown" } },
    });
    expect((await handleStripeWebhook(deps, sub.payload, sub.signature)).status).toBe(200);

    const other = signedRequest({ id: "evt_5", type: "invoice.paid", data: { object: {} } });
    expect((await handleStripeWebhook(deps, other.payload, other.signature)).status).toBe(200);
    expect(deps.applySubscriptionState).not.toHaveBeenCalled();
  });
});

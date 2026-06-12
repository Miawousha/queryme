/**
 * One-shot LIVE-mode Stripe go-live. With STRIPE_LIVE_SECRET_KEY in
 * .env.local it (1) ensures the "Queritae Pro" product + $9/month price
 * (same lookup_key as stripe-setup.ts), (2) ensures the production webhook
 * endpoint with the three handled events, (3) ensures a default Customer
 * Portal configuration (live mode has none until created, and the portal
 * route relies on the default). Idempotent; prints JSON without secrets —
 * the webhook signing secret is written to GOLIVE_SECRET_OUT (mode 600)
 * because Stripe only reveals it at endpoint creation.
 *
 * Usage: pnpm stripe:golive
 * Env:   STRIPE_LIVE_SECRET_KEY (required, sk_live_/rk_live_ only)
 *        GOLIVE_SITE_URL    (default https://queritae.com)
 *        GOLIVE_SECRET_OUT  (default /tmp/queritae-stripe-whsec)
 */
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import Stripe from "stripe";

const LOOKUP_KEY = "queritae_pro_monthly";
const PRODUCT_NAME = "Queritae Pro";
const ENABLED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function ensurePrice(stripe: Stripe) {
  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    return {
      created: false,
      productId: typeof price.product === "string" ? price.product : price.product.id,
      priceId: price.id,
    };
  }
  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    metadata: { app: "queritae", plan: "pro" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 900,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: LOOKUP_KEY,
  });
  return { created: true, productId: product.id, priceId: price.id };
}

async function ensureWebhook(stripe: Stripe, url: string, secretOut: string) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === url);
  if (existing) {
    const sameEvents =
      existing.enabled_events.length === ENABLED_EVENTS.length &&
      ENABLED_EVENTS.every((e) => existing.enabled_events.includes(e));
    if (!sameEvents) {
      await stripe.webhookEndpoints.update(existing.id, { enabled_events: ENABLED_EVENTS });
    }
    // Stripe only returns the signing secret at creation time. If the
    // endpoint pre-exists, the secret must come from the dashboard (or
    // delete the endpoint and rerun to mint a fresh one).
    return { created: false, endpointId: existing.id, secretCaptured: false };
  }
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ENABLED_EVENTS,
    description: "Queritae billing (plan sync)",
  });
  fs.writeFileSync(secretOut, endpoint.secret ?? "", { mode: 0o600 });
  return { created: true, endpointId: endpoint.id, secretCaptured: endpoint.secret != null };
}

async function ensurePortalConfig(stripe: Stripe) {
  const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (configs.data.length > 0) {
    return { created: false, configurationId: configs.data[0].id };
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Queritae Pro" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  return { created: true, configurationId: config.id };
}

async function main() {
  const key = process.env.STRIPE_LIVE_SECRET_KEY;
  if (!key) {
    console.error(JSON.stringify({ ok: false, error: "STRIPE_LIVE_SECRET_KEY is not set" }));
    process.exit(1);
  }
  if (!/^(sk|rk)_live_/.test(key)) {
    console.error(
      JSON.stringify({ ok: false, error: "STRIPE_LIVE_SECRET_KEY is not a live-mode key" }),
    );
    process.exit(1);
  }
  const siteUrl = (process.env.GOLIVE_SITE_URL ?? "https://queritae.com").replace(/\/$/, "");
  const secretOut = process.env.GOLIVE_SECRET_OUT ?? "/tmp/queritae-stripe-whsec";
  const stripe = new Stripe(key);

  const price = await ensurePrice(stripe);
  const webhook = await ensureWebhook(stripe, `${siteUrl}/api/stripe/webhook`, secretOut);
  // Portal config failure (e.g. live account not fully activated) shouldn't
  // void the price/webhook work above — report it and let the dashboard be
  // the fallback.
  let portal;
  try {
    portal = await ensurePortalConfig(stripe);
  } catch (err) {
    portal = { error: err instanceof Error ? err.message : String(err) };
  }

  console.log(
    JSON.stringify({
      ok: true,
      price,
      webhook: { ...webhook, secretOut: webhook.secretCaptured ? secretOut : null },
      portal,
      env: { STRIPE_PRO_PRICE_ID: price.priceId },
    }),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});

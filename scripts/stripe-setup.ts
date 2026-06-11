/**
 * One-shot Stripe bootstrap: ensures the "Queritae Pro" product and its
 * $9/month USD price exist, keyed by the price lookup_key so reruns are
 * no-ops. Prints JSON with the ids to wire into env.
 *
 * Usage: pnpm stripe:setup   (reads STRIPE_SECRET_KEY from .env.local)
 */
import fs from "node:fs";

// This script runs standalone via `tsx`, which (unlike Next.js) does not load
// `.env.local` automatically. Load it here so `pnpm stripe:setup` works as
// documented, without needing the caller to export STRIPE_SECRET_KEY.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import Stripe from "stripe";

const LOOKUP_KEY = "queritae_pro_monthly";
const PRODUCT_NAME = "Queritae Pro";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY is not set" }));
    process.exit(1);
  }
  const stripe = new Stripe(key);

  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(
      JSON.stringify({
        ok: true,
        created: false,
        productId: typeof price.product === "string" ? price.product : price.product.id,
        priceId: price.id,
        env: { STRIPE_PRO_PRICE_ID: price.id },
      }),
    );
    return;
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
  console.log(
    JSON.stringify({
      ok: true,
      created: true,
      productId: product.id,
      priceId: price.id,
      env: { STRIPE_PRO_PRICE_ID: price.id },
    }),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});

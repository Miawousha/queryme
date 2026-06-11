import Stripe from "stripe";

/**
 * Lazily constructed Stripe client. Reads the key at call time (not import
 * time) so tests and builds that never touch billing don't need it set.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

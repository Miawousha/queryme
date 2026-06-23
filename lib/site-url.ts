/**
 * Platform origin, e.g. https://queritae.com (trailing slash trimmed).
 *
 * Reads NEXT_PUBLIC_SITE_URL — the same env var billing's siteUrl() uses —
 * directly, rather than importing it from the billing module, so callers (the
 * auto-sync path in particular) never pull the Stripe module graph.
 */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

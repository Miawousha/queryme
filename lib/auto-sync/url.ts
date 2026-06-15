/**
 * Site origin for the public webhook URL. Reads NEXT_PUBLIC_SITE_URL (the same
 * env var billing's siteUrl() uses) directly rather than importing it from the
 * billing module, so the auto-sync path never pulls the Stripe module graph.
 */
function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Absolute URL of the per-account GitHub webhook endpoint. */
export function webhookUrlFor(username: string): string {
  return `${siteOrigin()}/api/a/${encodeURIComponent(username)}/sync-webhook`;
}

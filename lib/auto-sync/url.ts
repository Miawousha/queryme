import { siteOrigin } from "@/lib/site-url";

/** Absolute URL of the per-account GitHub webhook endpoint. */
export function webhookUrlFor(username: string): string {
  return `${siteOrigin()}/api/a/${encodeURIComponent(username)}/sync-webhook`;
}

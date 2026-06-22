import { getDb } from "@/lib/db/client";
import { listDomainsByAccount } from "@/lib/domains/repo";

/** Platform origin, e.g. https://queritae.com (trailing slash trimmed). Mirrors
 * the NEXT_PUBLIC_SITE_URL pattern in lib/auto-sync/url.ts. */
function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function fallbackUrl(username?: string): string {
  return username ? `${siteOrigin()}/${encodeURIComponent(username)}` : siteOrigin();
}

/**
 * Canonical public URL of an account's profile home (`/`). Prefers the oldest
 * verified custom domain (its root is already vanity-hosted to the tenant in
 * lib/domains/host.ts); otherwise the platform URL. Fails open to the platform
 * fallback — never throws — so the CV always renders.
 */
export async function resolveProfileUrl(opts: {
  accountId: string;
  username?: string;
}): Promise<string> {
  // Under the local persona override there is no DB row; use the fallback,
  // mirroring lib/accounts/root.ts.
  if (process.env.PERSONA_LOCAL_OVERRIDE) return fallbackUrl(opts.username);
  try {
    const domains = await listDomainsByAccount(getDb(), opts.accountId);
    const active = domains.find((d) => d.status === "active");
    if (active) return `https://${active.hostname}`;
  } catch {
    // fail open — fall through to the platform URL
  }
  return fallbackUrl(opts.username);
}

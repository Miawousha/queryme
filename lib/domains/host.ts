/** Hosts the platform serves itself (never rewritten to a tenant). */
export function isPlatformHost(host: string, platformHost: string | null): boolean {
  if (host === "localhost" || host.startsWith("localhost:")) return true;
  if (host === "127.0.0.1" || host.startsWith("127.")) return true;
  if (host.endsWith(".vercel.app")) return true;
  if (platformHost && (host === platformHost || host.endsWith(`.${platformHost}`))) return true;
  return false;
}

/**
 * Resolve a custom host to an account slug via `lookup` (the KV reader).
 * Fails OPEN: any lookup error returns null so a KV/network blip falls back to
 * normal routing instead of 500-ing every request.
 */
export async function resolveCustomHost(
  host: string,
  lookup: (host: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    return await lookup(host);
  } catch {
    return null;
  }
}

/** Paths the platform vanity-hosts on a tenant's custom domain. */
const VANITY_PATHS = new Set(["/", "/cv"]);

/**
 * Map an incoming path on a custom (tenant) host to the internal tenant path to
 * rewrite to, or null to pass the request through unchanged. Only the account
 * home ("/") and its CV ("/cv") are vanity-hosted; everything else resolves by
 * its normal path.
 */
export function customHostTarget(pathname: string, slug: string): string | null {
  if (!VANITY_PATHS.has(pathname)) return null;
  return pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
}

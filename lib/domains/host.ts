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

/**
 * Open-redirect guard for a `returnTo` query/form value. Only same-origin
 * absolute paths are honored: must start with a single "/", must not be
 * protocol-relative ("//"), must not contain a scheme or a backslash. Anything
 * else returns `fallback`.
 */
export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

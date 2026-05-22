import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for rate-limit keying. On Vercel the platform sets
 * `x-forwarded-for`; the value is still client-influenceable, so this is an
 * abuse deterrent — not a security boundary.
 */
export function requestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Admin session auth.
 *
 * The /admin area is gated by a single shared password (`ADMIN_PASSWORD`).
 * On login, a signed, expiring session token is issued and stored in an
 * httpOnly cookie. The token is an HMAC-SHA256 of its expiry, keyed by the
 * admin password — so rotating the password invalidates every session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "queryme_admin";

/** Session lifetime: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mints a session token that is valid until `expiresAt` (epoch ms). */
export function createSessionToken(expiresAt: number, secret: string): string {
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

/** Verifies a session token: signature must match and it must not be expired. */
export function verifySessionToken(token: string, now: number, secret: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now;
}

/** Constant-time check of a submitted password against the expected one. */
export function verifyPassword(input: string, expected: string): boolean {
  return safeEqual(input, expected);
}

/**
 * Reads the request cookies and reports whether the caller holds a valid admin
 * session. Returns false when `ADMIN_PASSWORD` is unset (admin disabled).
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  return verifySessionToken(token, Date.now(), secret);
}

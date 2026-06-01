/**
 * Account sessions.
 *
 * A signed, expiring `queryme_session` cookie carries the owning account id.
 * The token is `${accountId}.${expiresAt}.${hmac}` keyed by SESSION_SECRET, so
 * rotating the secret invalidates every session. Minted by GitHub OAuth
 * (browser) or the ADMIN_PASSWORD machine login (CLI). This module stays pure
 * (crypto + cookie read only) — account/role lookups live in lib/accounts/guard.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "queryme_session";

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

/** Mints a session token for `accountId`, valid until `expiresAt` (epoch ms). */
export function createSessionToken(accountId: string, expiresAt: number, secret: string): string {
  const payload = `${accountId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verifies a session token. Returns the accountId when the signature matches and
 * the token is unexpired; otherwise null. (Account UUIDs contain no dots, so the
 * payload splits cleanly into accountId + expiry.)
 */
export function verifySessionToken(token: string, now: number, secret: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return null;
  const accountId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (!accountId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return accountId;
}

/** Constant-time check of a submitted password (CLI machine login). */
export function verifyPassword(input: string, expected: string): boolean {
  return safeEqual(input, expected);
}

/** Reads + verifies the session cookie, returning the owning account id or null. */
export async function getSessionAccountId(): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, Date.now(), secret);
}

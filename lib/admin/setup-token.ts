import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Scoped, short-lived credential the admin UI bakes into the agent setup
 * prompt so a user's coding agent can register its freshly-built content repo
 * without a browser session. Format: `setup.${accountId}.${expiresAt}.${hmac}`.
 *
 * The HMAC is keyed by a value DERIVED from SESSION_SECRET (not the raw
 * secret), so a setup token can never be a valid session token or vice versa
 * even though both formats are dot-delimited — the signing keys differ.
 */
export const SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

const PREFIX = "setup";
const DOMAIN = "queritae-setup-token-v1";

function deriveKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(DOMAIN).digest();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mint a setup token for `accountId`, valid until `expiresAt` (epoch ms). */
export function createSetupToken(accountId: string, expiresAt: number, secret: string): string {
  const payload = `${PREFIX}.${accountId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify a setup token. Returns the accountId when the signature matches, the
 * prefix is correct, and the token is unexpired; otherwise null.
 */
export function verifySetupToken(token: string, now: number, secret: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const accountId = parts[1];
  const expiresAt = Number(parts[2]);
  if (!accountId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return accountId;
}

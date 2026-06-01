import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A signed, short-lived CSRF state: `${nonce}.${expiry}.${hmac}`. */
export function createState(secret: string, now: number = Date.now()): string {
  const payload = `${randomBytes(16).toString("base64url")}.${now + STATE_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyState(state: string, now: number, secret: string): boolean {
  const lastDot = state.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = state.slice(0, lastDot);
  const signature = state.slice(lastDot + 1);
  if (!constantTimeEqual(signature, sign(payload, secret))) return false;
  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return false;
  const expiry = Number(payload.slice(sep + 1));
  return Number.isFinite(expiry) && expiry > now;
}

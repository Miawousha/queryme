import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time verification of a GitHub `X-Hub-Signature-256` header against a
 * per-account secret. Returns false (never throws) for a missing header or a
 * length mismatch so the caller can branch on a plain boolean. The body must be
 * the RAW request bytes — re-serializing parsed JSON would change the digest.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = Buffer.from(signatureHeader);
  const want = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths; guard first.
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

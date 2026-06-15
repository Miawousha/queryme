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

export type DecideInput = {
  event: string | null; // X-GitHub-Event header
  ref: string | null; // payload.ref, e.g. "refs/heads/main"
  enabled: boolean; // auto-sync enabled for this account
  branch: string; // the account's STORED branch
};

export type Decision = "sync" | "skip" | "pong";

/**
 * Routes a VERIFIED webhook delivery. Pure — no I/O. A `ping` is always
 * acknowledged (pong). Otherwise a sync happens only for a `push` to the
 * stored branch while auto-sync is enabled; everything else is skipped.
 */
export function decideAction(input: DecideInput): Decision {
  if (input.event === "ping") return "pong";
  if (!input.enabled) return "skip";
  if (input.event !== "push") return "skip";
  if (input.ref !== `refs/heads/${input.branch}`) return "skip";
  return "sync";
}

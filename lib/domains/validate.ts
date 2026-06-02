// RFC-1123 hostname: labels of a-z/0-9/hyphen, no leading/trailing hyphen,
// total length 1–253, TLD 2–63 alpha chars.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export type DomainValidation = { ok: true } | { ok: false; reason: string };

export function validateHostname(
  host: string,
  platformHost: string | null,
): DomainValidation {
  if (!HOSTNAME_RE.test(host)) {
    return { ok: false, reason: "Enter a valid domain like cv.yourname.com." };
  }
  // Subdomain-only (v1): require at least 3 labels. This treats ccTLD apexes
  // like `name.co.uk` as valid; that is an accepted v1 simplification (we don't
  // ship the Public Suffix List). Vercel still validates the domain itself.
  if (host.split(".").length < 3) {
    return {
      ok: false,
      reason: "Use a subdomain (e.g. cv.yourname.com); bare domains aren't supported yet.",
    };
  }
  if (platformHost && (host === platformHost || host.endsWith(`.${platformHost}`))) {
    return { ok: false, reason: "That domain is reserved by the platform." };
  }
  return { ok: true };
}

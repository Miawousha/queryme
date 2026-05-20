export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "fastmail.com",
  "fastmail.fm",
  "zoho.com",
]);

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function isLikelyWorkEmail(email: string): boolean {
  const m = EMAIL_RE.exec(email.trim());
  if (!m) return false;
  const domain = m[1].toLowerCase();
  return !FREE_EMAIL_DOMAINS.has(domain);
}

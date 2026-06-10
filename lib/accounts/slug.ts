/**
 * Slugs that must never become account usernames because they collide with
 * existing top-level routes or framework/static paths. The `[username]` route
 * segment also rejects these as defence in depth.
 */
export const RESERVED_SLUGS = new Set<string>([
  "about", "cv", "admin", "api", "auth", "login", "signup", "waitlist",
  "_next", "sitemap.xml", "favicon.ico", "robots.txt",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// GitHub login rules: 1–39 chars, alphanumeric or single hyphens, no leading
// or trailing hyphen. (We do not enforce "no consecutive hyphens" — GitHub
// historically allowed them and we accept any login GitHub itself issued.)
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name) && !isReservedSlug(name);
}

export type BadgeColor = "ink" | "white";

export interface SignatureSnippetOptions {
  /** The user's public profile URL (from resolveProfileUrl). */
  profileUrl: string;
  /** Platform origin hosting the badge image, e.g. https://queritae.com. */
  origin: string;
  /** Which monochrome PNG to reference. */
  color: BadgeColor;
}

/** Appends the signature attribution param, respecting any existing query. */
function withRef(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "ref=signature";
}

/** Ready-to-paste email-signature HTML: the brand badge linking to the profile. */
export function buildSignatureSnippet({ profileUrl, origin, color }: SignatureSnippetOptions): string {
  const href = withRef(profileUrl);
  const src = `${origin.replace(/\/$/, "")}/badge/queritae-${color}.png`;
  return (
    `<a href="${href}">\n` +
    `  <img src="${src}" alt="Queritae" width="24" height="24" style="border:0" />\n` +
    `</a>`
  );
}

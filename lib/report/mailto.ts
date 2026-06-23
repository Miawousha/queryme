/**
 * Builds a `mailto:` href for the "Report this persona" action. Pure — the
 * caller resolves the abuse address (REPORT_EMAIL) and the persona's absolute
 * URL server-side. Subject/body are URL-encoded.
 */
export function buildReportMailto(email: string, ctx: { slug: string; url: string }): string {
  const subject = encodeURIComponent(`Report: persona "${ctx.slug}" on Queritae`);
  const body = encodeURIComponent([
    `I'd like to report the persona at: ${ctx.url}`,
    "",
    "Reason (please describe):",
    "",
  ].join("\n"));
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

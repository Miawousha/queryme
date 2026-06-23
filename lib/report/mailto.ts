/**
 * Builds a `mailto:` href for the "Report this persona" action. Pure — the
 * caller resolves the abuse address (REPORT_EMAIL) and the persona's absolute
 * URL server-side. Subject/body are URL-encoded.
 */
export function buildReportMailto(email: string, ctx: { slug: string; url: string }): string {
  const subject = `Report: persona "${ctx.slug}" on Queritae`;
  const body = [
    `I'd like to report the persona at: ${ctx.url}`,
    "",
    "Reason (please describe):",
    "",
  ].join("\n");
  const qs = new URLSearchParams({ subject, body }).toString();
  return `mailto:${email}?${qs}`;
}

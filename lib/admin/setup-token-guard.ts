import { resolveAccountAdmin, type AdminResolution } from "@/app/[username]/admin/resolve";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { verifySetupToken } from "@/lib/admin/setup-token";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Like `resolveAccountAdmin`, but when there is no browser session it also
 * accepts a scoped setup token (Authorization: Bearer ...) whose accountId
 * matches the slug account. Used by the persona-source endpoints so a user's
 * coding agent can connect the repo headlessly during onboarding. Any other
 * resolution (not-found / needs-tos / ok) is returned unchanged.
 */
export async function resolveAccountAdminViaSessionOrToken(
  slug: string,
  req: Request,
): Promise<AdminResolution> {
  const session = await resolveAccountAdmin(slug);
  if (session.kind !== "login") return session;

  const token = bearer(req);
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return session;

  const accountId = verifySetupToken(token, Date.now(), secret);
  if (!accountId) return session;

  const account = await loadAccountForSlug(slug);
  if (!account || account.id !== accountId) return session;
  return { kind: "ok", account };
}

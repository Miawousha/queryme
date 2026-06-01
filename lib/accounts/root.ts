import { getDb } from "@/lib/db/client";
import { getRootAccountId } from "@/lib/accounts/repo";

/**
 * The account id whose content the root surfaces (/, /api/chat, /api/mcp, ...)
 * render. With PERSONA_LOCAL_OVERRIDE set (dev/test) the override fixture is
 * served for any id, so we skip the DB lookup and return a sentinel.
 */
export async function resolveRootAccountId(): Promise<string> {
  if (process.env.PERSONA_LOCAL_OVERRIDE) return "local-override";
  return getRootAccountId(getDb());
}

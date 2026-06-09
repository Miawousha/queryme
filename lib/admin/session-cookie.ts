/**
 * Name of the signed session cookie. Lives in its own pure module so both the
 * server (lib/admin/auth.ts) and the CLI remote client (scripts/lib/admin-remote.ts)
 * can share it without the CLI importing next/headers.
 */
export const SESSION_COOKIE = "queritae_session";

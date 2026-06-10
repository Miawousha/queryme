// With PERSONA_LOCAL_OVERRIDE set (dev/test), accountId can be the non-UUID
// sentinel "local-override" (lib/accounts/root.ts). DB writes keyed by
// account_id (a uuid column) must be skipped for it — this is the shared
// "is this a real, metered account?" check.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

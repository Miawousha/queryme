import { CliError } from "./admin-errors";
import { SESSION_COOKIE } from "@/lib/admin/session-cookie";
import type { PersonaSource } from "@/lib/db/schema";

/** A remote admin-API failure, carrying an actionable hint. */
export class AdminRemoteError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, hint);
    this.name = "AdminRemoteError";
  }
}

export type StatusResponse = { active: PersonaSource | null; history: PersonaSource[] };
export type SyncResponse = { commitSha: string; syncedAt: string };

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Reads Set-Cookie via getSetCookie() (Node 19.7+), falling back to get(). */
function setCookieHeaders(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

export function extractCookie(setCookies: string[], name: string): string | null {
  for (const header of setCookies) {
    const first = header.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    if (first.slice(0, eq).trim() === name) return first.slice(eq + 1).trim();
  }
  return null;
}

function mapStatusError(status: number): AdminRemoteError | null {
  if (status === 401) {
    return new AdminRemoteError(
      "incorrect admin password",
      "check ADMIN_PASSWORD for the target instance",
    );
  }
  if (status === 429) {
    return new AdminRemoteError(
      "rate-limited by the admin login throttle",
      "wait and retry",
    );
  }
  return null;
}

export async function login(baseUrl: string, password: string): Promise<string> {
  const res = await fetch(`${trimSlash(baseUrl)}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const mapped = mapStatusError(res.status);
  if (mapped) throw mapped;
  if (!res.ok) throw new AdminRemoteError(`login failed (${res.status})`);
  const cookie = extractCookie(setCookieHeaders(res), SESSION_COOKIE);
  if (!cookie) {
    throw new AdminRemoteError(
      "login succeeded but no session cookie was returned",
      "verify the --remote URL points at the queryme app",
    );
  }
  return cookie;
}

export async function fetchStatus(baseUrl: string, cookie: string): Promise<StatusResponse> {
  const res = await fetch(`${trimSlash(baseUrl)}/api/admin/persona-source`, {
    headers: { Cookie: `${SESSION_COOKIE}=${cookie}` },
  });
  const mapped = mapStatusError(res.status);
  if (mapped) throw mapped;
  if (!res.ok) throw new AdminRemoteError(`status request failed (${res.status})`);
  return (await res.json()) as StatusResponse;
}

export async function postSync(
  baseUrl: string,
  cookie: string,
  body: { repoUrl: string; branch: string },
): Promise<SyncResponse> {
  const res = await fetch(`${trimSlash(baseUrl)}/api/admin/persona-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${cookie}` },
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AdminRemoteError(
      errBody?.error ?? "sync rejected (400)",
      "check the repo URL, branch, and that required persona files exist",
    );
  }
  const mapped = mapStatusError(res.status);
  if (mapped) throw mapped;
  if (!res.ok) throw new AdminRemoteError(`sync request failed (${res.status})`);
  return (await res.json()) as SyncResponse;
}

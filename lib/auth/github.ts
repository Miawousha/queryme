const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export type GitHubUser = { id: number; login: string };

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", "read:user");
  u.searchParams.set("state", opts.state);
  return u.toString();
}

/** Exchanges an OAuth `code` for an access token. Throws on failure. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new Error(`github token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`github token exchange: ${data.error ?? "no token"}`);
  return data.access_token;
}

/** Fetches the authenticated user's id + login. Throws on failure. */
export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "queryme",
    },
  });
  if (!res.ok) throw new Error(`github /user failed: ${res.status}`);
  const data = (await res.json()) as { id: number; login: string };
  return { id: data.id, login: data.login };
}

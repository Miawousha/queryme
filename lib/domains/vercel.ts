const API = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

export type ProjectDomain = {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};

export type DomainConfigResult = { misconfigured: boolean };

type Cfg = { token: string; projectId: string; teamId?: string };

function cfg(): Cfg {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw new Error("VERCEL_TOKEN and VERCEL_PROJECT_ID must be set to manage custom domains.");
  }
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

async function call<T>(path: string, init: RequestInit, c: Cfg): Promise<T> {
  const qs = c.teamId ? `?teamId=${c.teamId}` : "";
  const res = await fetch(`${API}${path}${qs}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new VercelApiError(
      body?.error?.code ?? `http_${res.status}`,
      body?.error?.message ?? `Vercel API error (${res.status})`,
    );
  }
  return body as T;
}

export type VercelClient = typeof vercelDomains;

export const vercelDomains = {
  add(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v10/projects/${c.projectId}/domains`, { method: "POST", body: JSON.stringify({ name: host }) }, c);
  },
  get(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v9/projects/${c.projectId}/domains/${host}`, { method: "GET" }, c);
  },
  config(host: string): Promise<DomainConfigResult> {
    const c = cfg();
    return call(`/v6/domains/${host}/config`, { method: "GET" }, c);
  },
  verify(host: string): Promise<ProjectDomain> {
    const c = cfg();
    return call(`/v9/projects/${c.projectId}/domains/${host}/verify`, { method: "POST" }, c);
  },
  async remove(host: string): Promise<void> {
    const c = cfg();
    await call(`/v9/projects/${c.projectId}/domains/${host}`, { method: "DELETE" }, c);
  },
};

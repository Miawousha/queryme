import { Redis } from "@upstash/redis";

const KEY_PREFIX = "domain:";

let cached: Redis | null = null;
function client(): Redis {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN required for the custom-domain cache.");
  }
  // automaticDeserialization:false keeps values as plain strings (see lib/kv/client.ts).
  cached = new Redis({ url, token, automaticDeserialization: false });
  return cached;
}

export async function getDomainSlug(host: string): Promise<string | null> {
  return (await client().get<string>(`${KEY_PREFIX}${host}`)) ?? null;
}

export async function setDomainSlug(host: string, slug: string): Promise<void> {
  await client().set(`${KEY_PREFIX}${host}`, slug);
}

export async function delDomainSlug(host: string): Promise<void> {
  await client().del(`${KEY_PREFIX}${host}`);
}

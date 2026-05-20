import { Redis } from "@upstash/redis";

export type KvClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<"OK" | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
};

class UpstashKv implements KvClient {
  constructor(private redis: Redis) {}
  async get(key: string) { return (await this.redis.get<string>(key)) ?? null; }
  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    const args: any = {};
    if (opts?.ex) args.ex = opts.ex;
    if (opts?.nx) args.nx = true;
    const r = await this.redis.set(key, value, args);
    return r === "OK" ? "OK" : null;
  }
  async incr(key: string) { return await this.redis.incr(key); }
  async expire(key: string, seconds: number) { return await this.redis.expire(key, seconds); }
  async del(key: string) { return await this.redis.del(key); }
}

export class MemoryKv implements KvClient {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private alive(k: string) {
    const e = this.store.get(k);
    if (!e) return null;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) {
      this.store.delete(k);
      return null;
    }
    return e;
  }

  async get(key: string) { return this.alive(key)?.value ?? null; }

  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    if (opts?.nx && this.alive(key)) return null;
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async incr(key: string) {
    const current = this.alive(key);
    const next = (current ? parseInt(current.value, 10) : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number) {
    const e = this.alive(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
}

let cached: KvClient | null = null;

export function getKv(): KvClient {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL / KV_REST_API_TOKEN not set. Configure them in .env.local or Vercel env.",
    );
  }
  cached = new UpstashKv(new Redis({ url, token }));
  return cached;
}

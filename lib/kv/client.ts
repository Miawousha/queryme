import { Redis } from "@upstash/redis";
import type { Redis as IORedisClient } from "ioredis";

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

/**
 * `RedisKv` is the self-hosted driver. It speaks ioredis's positional-arg
 * `set` API (`set(k, v, "EX", 60, "NX")`), which maps 1:1 to the Redis wire
 * protocol. The constructor accepts the minimal subset of ioredis's interface
 * we use, so tests can stub it without pulling the real client.
 */
type RedisLike = {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ...args: unknown[]): Promise<string | null>;
  incr(k: string): Promise<number>;
  expire(k: string, s: number): Promise<number>;
  del(k: string): Promise<number>;
};

export class RedisKv implements KvClient {
  constructor(private redis: RedisLike) {}
  async get(key: string) {
    return await this.redis.get(key);
  }
  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    const args: unknown[] = [];
    if (opts?.ex) args.push("EX", opts.ex);
    if (opts?.nx) args.push("NX");
    const r = await this.redis.set(key, value, ...args);
    return r === "OK" ? "OK" : null;
  }
  async incr(key: string) {
    return await this.redis.incr(key);
  }
  async expire(key: string, seconds: number) {
    return await this.redis.expire(key, seconds);
  }
  async del(key: string) {
    return await this.redis.del(key);
  }
}

let cached: KvClient | null = null;

export function getKv(): KvClient {
  if (cached) return cached;

  // Self-hosted Redis (Docker, RDS, any standard Redis) — preferred when set.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // Lazy require so we don't pull `ioredis` into prod bundles that use Upstash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedis = require("ioredis").Redis ?? require("ioredis").default ?? require("ioredis");
    const client: IORedisClient = new IORedis(redisUrl);
    cached = new RedisKv(client as RedisLike);
    return cached;
  }

  // Upstash REST API — Vercel-deployed prod.
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Set REDIS_URL (self-host) or KV_REST_API_URL / KV_REST_API_TOKEN (Upstash). Configure in .env.local or container env.",
    );
  }
  // `automaticDeserialization: false` is REQUIRED. By default @upstash/redis
  // JSON-parses values on read, so a numeric string like a 6-digit verification
  // code ("920742") round-trips back as the number 920742 — breaking the strict
  // string comparison in verifyCode. The KvClient contract is string-only, so we
  // disable deserialization to keep the real client faithful to MemoryKv.
  cached = new UpstashKv(new Redis({ url, token, automaticDeserialization: false }));
  return cached;
}

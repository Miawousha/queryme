import type { KvClient } from "./client";

export type RateLimitInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  windowSeconds: number;
};

export async function checkRateLimit(kv: KvClient, input: RateLimitInput): Promise<RateLimitResult> {
  const fullKey = `rl:${input.key}`;
  const count = await kv.incr(fullKey);
  if (count === 1) {
    await kv.expire(fullKey, input.windowSeconds);
  }
  const allowed = count <= input.limit;
  return {
    allowed,
    remaining: Math.max(0, input.limit - count),
    windowSeconds: input.windowSeconds,
  };
}

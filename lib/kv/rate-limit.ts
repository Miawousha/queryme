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
  // Create the counter with its TTL the first time the key is seen; on every
  // later call within the window the NX `set` is a no-op. This guarantees the
  // window can never be left without an expiry — unlike a separate `incr`
  // then `expire`, where a crash in between would wedge the key forever.
  await kv.set(fullKey, "0", { ex: input.windowSeconds, nx: true });
  const count = await kv.incr(fullKey);
  const allowed = count <= input.limit;
  return {
    allowed,
    remaining: Math.max(0, input.limit - count),
    windowSeconds: input.windowSeconds,
  };
}

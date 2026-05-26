import { describe, it, expect } from "vitest";
import { RedisKv } from "@/lib/kv/client";

class FakeRedis {
  store = new Map<string, string>();
  ttl = new Map<string, number>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async set(k: string, v: string, ...args: unknown[]) {
    let ex: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "EX") ex = args[++i] as number;
      else if (args[i] === "NX") nx = true;
    }
    if (nx && this.store.has(k)) return null;
    this.store.set(k, v);
    if (ex) this.ttl.set(k, Date.now() + ex * 1000);
    return "OK";
  }
  async incr(k: string) {
    const n = parseInt(this.store.get(k) ?? "0", 10) + 1;
    this.store.set(k, String(n));
    return n;
  }
  async expire(k: string, s: number) {
    if (!this.store.has(k)) return 0;
    this.ttl.set(k, Date.now() + s * 1000);
    return 1;
  }
  async del(k: string) { return this.store.delete(k) ? 1 : 0; }
}

describe("RedisKv", () => {
  it("implements the KvClient contract over an ioredis-shaped client", async () => {
    const r = new FakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = new RedisKv(r as any);
    expect(await kv.set("k", "v", { ex: 60 })).toBe("OK");
    expect(await kv.get("k")).toBe("v");
    expect(await kv.incr("n")).toBe(1);
    expect(await kv.incr("n")).toBe(2);
    expect(await kv.del("k")).toBe(1);
    expect(await kv.set("nx", "1", { nx: true })).toBe("OK");
    expect(await kv.set("nx", "2", { nx: true })).toBeNull();
  });
});

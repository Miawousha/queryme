import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

describe("checkRateLimit", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("allows requests under the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it("blocks the request that exceeds the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    }
    const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("isolates different keys", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 60 });
    }
    const other = await checkRateLimit(kv, { key: "ip:2.2.2.2", limit: 5, windowSeconds: 60 });
    expect(other.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 1 });
    }
    await new Promise((r) => setTimeout(r, 1100));
    const r = await checkRateLimit(kv, { key: "ip:1.1.1.1", limit: 5, windowSeconds: 1 });
    expect(r.allowed).toBe(true);
  });
});

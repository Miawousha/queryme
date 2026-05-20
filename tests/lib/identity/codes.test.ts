import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { issueCode, verifyCode } from "@/lib/identity/codes";

describe("verification codes", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("issues a 6-digit numeric code", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies the issued code, consumes it (cannot be reused)", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const first = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code });
    expect(first.ok).toBe(true);
    const second = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("not_found");
  });

  it("rejects wrong codes", async () => {
    await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const r = await verifyCode(kv, { conversationId: "c1", email: "a@b.com", code: "000000" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mismatch");
  });

  it("isolates codes per (conversationId, email)", async () => {
    const a = await issueCode(kv, { conversationId: "c1", email: "a@b.com" });
    const b = await issueCode(kv, { conversationId: "c2", email: "a@b.com" });
    const verifyAcrossConvs = await verifyCode(kv, { conversationId: "c2", email: "a@b.com", code: a.code });
    expect(verifyAcrossConvs.ok).toBe(false);
    const verifyOwn = await verifyCode(kv, { conversationId: "c2", email: "a@b.com", code: b.code });
    expect(verifyOwn.ok).toBe(true);
  });

  it("normalizes email casing", async () => {
    const { code } = await issueCode(kv, { conversationId: "c1", email: "Alice@Acme.COM" });
    const r = await verifyCode(kv, { conversationId: "c1", email: "alice@acme.com", code });
    expect(r.ok).toBe(true);
  });
});

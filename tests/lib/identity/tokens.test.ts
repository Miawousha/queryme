import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { issueToken, validateToken, isConversationUnlocked } from "@/lib/identity/tokens";

describe("identity tokens", () => {
  let kv: MemoryKv;
  beforeEach(() => { kv = new MemoryKv(); });

  it("issued token validates for the same conversation", async () => {
    const { token } = await issueToken(kv, { conversationId: "c1" });
    const r = await validateToken(kv, { token });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.conversationId).toBe("c1");
  });

  it("token format is opaque + url-safe", async () => {
    const { token } = await issueToken(kv, { conversationId: "c1" });
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("invalid tokens are rejected", async () => {
    const r = await validateToken(kv, { token: "not-a-real-token" });
    expect(r.ok).toBe(false);
  });

  it("isConversationUnlocked reflects token presence", async () => {
    expect(await isConversationUnlocked(kv, "c1")).toBe(false);
    await issueToken(kv, { conversationId: "c1" });
    expect(await isConversationUnlocked(kv, "c1")).toBe(true);
  });
});

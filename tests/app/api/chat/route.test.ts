import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/chat/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any; // NextRequest is structurally compatible with Request for our purposes
}

describe("/api/chat POST validation", () => {
  it("rejects an empty body", async () => {
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects a body without messages", async () => {
    const res = await POST(makeReq({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  it("rejects a body with > 50 messages", async () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      parts: [{ type: "text" as const, text: "hi" }],
    }));
    const res = await POST(makeReq({ messages }));
    expect(res.status).toBe(400);
  });

  it("rejects a body whose user text exceeds 20,000 chars total", async () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "x".repeat(20_001) }],
      },
    ];
    const res = await POST(makeReq({ messages }));
    expect(res.status).toBe(400);
  });
});

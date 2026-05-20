import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/forward-question/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/forward-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/forward-question POST validation", () => {
  it("rejects empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing question", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized question", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      question: "x".repeat(2001),
    }));
    expect(res.status).toBe(400);
  });
});

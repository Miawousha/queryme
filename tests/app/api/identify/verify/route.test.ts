import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/identify/verify/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/identify/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/identify/verify POST validation", () => {
  it("rejects empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing fields", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric code", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      workEmail: "x@acme.com",
      code: "abcdef",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects code of wrong length", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      workEmail: "x@acme.com",
      code: "12345",
    }));
    expect(res.status).toBe(400);
  });
});

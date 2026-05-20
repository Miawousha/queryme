import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/identify/request/route";

function makeReq(body: unknown) {
  return new Request("http://test/api/identify/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("/api/identify/request POST validation", () => {
  it("rejects an empty body", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const res = await POST(makeReq({ conversationId: "00000000-0000-4000-8000-000000000000" }));
    expect(res.status).toBe(400);
  });

  it("rejects a free-email work_email", async () => {
    const res = await POST(makeReq({
      conversationId: "00000000-0000-4000-8000-000000000000",
      name: "X", company: "Y", workEmail: "x@gmail.com", role: "Recruiter",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/free-?email|domain/i);
  });

  it("rejects malformed conversationId", async () => {
    const res = await POST(makeReq({
      conversationId: "not-a-uuid",
      name: "X", company: "Y", workEmail: "x@acme.com", role: "Recruiter",
    }));
    expect(res.status).toBe(400);
  });
});

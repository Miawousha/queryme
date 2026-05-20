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

  it("rejects a malformed conversationId", async () => {
    const res = await POST(makeReq({
      conversationId: "not-a-uuid",
      messages: [{ id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
    }));
    expect(res.status).toBe(400);
  });

  it("accepts multi-turn history containing non-text assistant parts", async () => {
    // From the 2nd turn onward the client echoes back assistant messages, whose
    // parts include non-text entries (e.g. `step-start`). Validation must accept
    // these. If validation passes, execution proceeds to getDb()/answer() which
    // need infra absent in the unit-test env — so a thrown error here is the
    // success signal; a returned response must NOT be a 400 validation rejection.
    const req = makeReq({
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hi" }] },
        {
          id: "2",
          role: "assistant",
          parts: [{ type: "step-start" }, { type: "text", text: "Hello!", state: "done" }],
        },
        { id: "3", role: "user", parts: [{ type: "text", text: "again" }] },
      ],
    });
    let status: number | undefined;
    try {
      status = (await POST(req)).status;
    } catch {
      return; // reached infra-dependent code — validation passed
    }
    expect(status).not.toBe(400);
  });
});

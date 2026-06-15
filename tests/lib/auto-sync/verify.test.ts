import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, decideAction } from "@/lib/auto-sync/verify";

const SECRET = "test-secret-abc123";

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifySignature", () => {
  const body = JSON.stringify({ ref: "refs/heads/main" });

  it("accepts a correctly signed body", () => {
    expect(verifySignature(SECRET, body, sign(SECRET, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifySignature(SECRET, body + "x", sign(SECRET, body))).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifySignature("other-secret", body, sign(SECRET, body))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifySignature(SECRET, body, null)).toBe(false);
  });

  it("rejects a length-mismatched header without throwing", () => {
    expect(verifySignature(SECRET, body, "sha256=deadbeef")).toBe(false);
  });
});

describe("decideAction", () => {
  const base = { event: "push", ref: "refs/heads/main", enabled: true, branch: "main" };

  it("syncs an eligible push to the stored branch", () => {
    expect(decideAction(base)).toBe("sync");
  });

  it("pongs a ping regardless of enabled", () => {
    expect(decideAction({ ...base, event: "ping", enabled: false })).toBe("pong");
  });

  it("skips when disabled", () => {
    expect(decideAction({ ...base, enabled: false })).toBe("skip");
  });

  it("skips a push to a different branch", () => {
    expect(decideAction({ ...base, ref: "refs/heads/dev" })).toBe("skip");
  });

  it("skips a non-push, non-ping event", () => {
    expect(decideAction({ ...base, event: "issues" })).toBe("skip");
  });

  it("skips when ref is missing", () => {
    expect(decideAction({ ...base, ref: null })).toBe("skip");
  });
});

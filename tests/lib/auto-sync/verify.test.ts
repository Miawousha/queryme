import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "@/lib/auto-sync/verify";

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

import { describe, it, expect } from "vitest";
import { createState, verifyState, constantTimeEqual } from "@/lib/auth/oauth-state";

const SECRET = "state-secret";

describe("oauth state", () => {
  it("round-trips a fresh state", () => {
    const now = Date.now();
    const s = createState(SECRET, now);
    expect(verifyState(s, now + 1000, SECRET)).toBe(true);
  });
  it("rejects an expired or tampered or wrong-secret state", () => {
    const now = Date.now();
    const s = createState(SECRET, now);
    expect(verifyState(s, now + 11 * 60 * 1000, SECRET)).toBe(false);
    expect(verifyState(s, now, "other")).toBe(false);
    expect(verifyState(s + "x", now, SECRET)).toBe(false);
  });
  it("constantTimeEqual compares", () => {
    expect(constantTimeEqual("ab", "ab")).toBe(true);
    expect(constantTimeEqual("ab", "ac")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
  });
});

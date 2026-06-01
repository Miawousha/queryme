import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  SESSION_TTL_MS,
} from "@/lib/admin/auth";

const SECRET = "super-secret-session-key";
const ACCT = "11111111-1111-1111-1111-111111111111";

describe("session tokens", () => {
  it("round-trips a token and returns the accountId", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, SECRET)).toBe(ACCT);
  });

  it("rejects an expired token", () => {
    const exp = 1_000_000;
    const token = createSessionToken(ACCT, exp, SECRET);
    expect(verifySessionToken(token, exp + 1, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const now = Date.now();
    const token = createSessionToken(ACCT, now + SESSION_TTL_MS, SECRET);
    const sig = token.slice(token.lastIndexOf(".") + 1);
    const forged = `${ACCT}.${now + SESSION_TTL_MS * 10}.${sig}`;
    expect(verifySessionToken(forged, now, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    const now = Date.now();
    expect(verifySessionToken("", now, SECRET)).toBeNull();
    expect(verifySessionToken("no-dots", now, SECRET)).toBeNull();
    expect(verifySessionToken("acct.notanumber.sig", now, SECRET)).toBeNull();
  });
});

describe("verifyPassword", () => {
  it("accepts an exact match and rejects mismatches", () => {
    expect(verifyPassword("hunter2", "hunter2")).toBe(true);
    expect(verifyPassword("hunter3", "hunter2")).toBe(false);
    expect(verifyPassword("short", "a-much-longer-password")).toBe(false);
    expect(verifyPassword("", "hunter2")).toBe(false);
  });
});

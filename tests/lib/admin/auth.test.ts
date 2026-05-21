import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  SESSION_TTL_MS,
} from "@/lib/admin/auth";

const SECRET = "super-secret-admin-password";

describe("session tokens", () => {
  it("round-trips a freshly minted token", () => {
    const now = Date.now();
    const token = createSessionToken(now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, SECRET)).toBe(true);
  });

  it("rejects a token that has expired", () => {
    const issuedExpiry = 1_000_000;
    const token = createSessionToken(issuedExpiry, SECRET);
    expect(verifySessionToken(token, issuedExpiry + 1, SECRET)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const now = Date.now();
    const token = createSessionToken(now + SESSION_TTL_MS, SECRET);
    expect(verifySessionToken(token, now, "a-different-secret")).toBe(false);
  });

  it("rejects a tampered token", () => {
    const now = Date.now();
    const token = createSessionToken(now + SESSION_TTL_MS, SECRET);
    // Bump the expiry in the payload without re-signing.
    const [, sig] = token.split(".");
    const forged = `${now + SESSION_TTL_MS * 10}.${sig}`;
    expect(verifySessionToken(forged, now, SECRET)).toBe(false);
  });

  it("rejects a malformed token", () => {
    const now = Date.now();
    expect(verifySessionToken("", now, SECRET)).toBe(false);
    expect(verifySessionToken("no-dot-here", now, SECRET)).toBe(false);
    expect(verifySessionToken("notanumber.sig", now, SECRET)).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts an exact match", () => {
    expect(verifyPassword("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyPassword("hunter3", "hunter2")).toBe(false);
  });

  it("rejects passwords of differing length", () => {
    expect(verifyPassword("short", "a-much-longer-password")).toBe(false);
  });

  it("rejects an empty input", () => {
    expect(verifyPassword("", "hunter2")).toBe(false);
  });
});

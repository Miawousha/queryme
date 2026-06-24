// tests/lib/admin/setup-token.test.ts
import { describe, it, expect } from "vitest";
import {
  createSetupToken,
  verifySetupToken,
  SETUP_TOKEN_TTL_MS,
} from "@/lib/admin/setup-token";
import { createSessionToken } from "@/lib/admin/auth";

const SECRET = "test-secret";
const ACCT = "11111111-1111-1111-1111-111111111111";

describe("setup-token", () => {
  it("round-trips a valid token", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token, 1_000_000, SECRET)).toBe(ACCT);
  });

  it("rejects an expired token", () => {
    const exp = 1_000_000;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token, 1_000_001, SECRET)).toBeNull();
  });

  it("rejects a tampered signature and a wrong secret", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const token = createSetupToken(ACCT, exp, SECRET);
    expect(verifySetupToken(token + "x", 1_000_000, SECRET)).toBeNull();
    expect(verifySetupToken(token, 1_000_000, "other-secret")).toBeNull();
  });

  it("does NOT accept a session token (domain separation)", () => {
    const exp = 1_000_000 + SETUP_TOKEN_TTL_MS;
    const session = createSessionToken(ACCT, exp, SECRET);
    expect(verifySetupToken(session, 1_000_000, SECRET)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { computeStatus } from "@/lib/domains/status";

describe("computeStatus", () => {
  it("is active only when verified and not misconfigured", () => {
    expect(computeStatus({ verified: true, misconfigured: false })).toBe("active");
  });
  it("is pending when unverified or misconfigured", () => {
    expect(computeStatus({ verified: false, misconfigured: false })).toBe("pending");
    expect(computeStatus({ verified: true, misconfigured: true })).toBe("pending");
  });
});

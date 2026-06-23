import { describe, it, expect } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

const FB = "/u/admin";

describe("safeReturnTo", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeReturnTo("/u/admin/settings", FB)).toBe("/u/admin/settings");
  });
  it("rejects protocol-relative URLs", () => {
    expect(safeReturnTo("//evil.com", FB)).toBe(FB);
  });
  it("rejects absolute URLs with a scheme", () => {
    expect(safeReturnTo("https://evil.com", FB)).toBe(FB);
    expect(safeReturnTo("javascript:alert(1)", FB)).toBe(FB);
  });
  it("rejects backslash tricks and non-slash starts", () => {
    expect(safeReturnTo("/\\evil.com", FB)).toBe(FB);
    expect(safeReturnTo("admin", FB)).toBe(FB);
  });
  it("falls back on null/empty", () => {
    expect(safeReturnTo(null, FB)).toBe(FB);
    expect(safeReturnTo("", FB)).toBe(FB);
    expect(safeReturnTo(undefined, FB)).toBe(FB);
  });
});

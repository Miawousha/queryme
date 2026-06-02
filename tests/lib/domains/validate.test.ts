import { describe, it, expect } from "vitest";
import { normalizeHostname, validateHostname } from "@/lib/domains/validate";

describe("normalizeHostname", () => {
  it("lowercases and strips scheme, path, port, trailing dot", () => {
    expect(normalizeHostname("  HTTPS://CV.Alex.com:443/foo ")).toBe("cv.alex.com");
    expect(normalizeHostname("cv.alex.com.")).toBe("cv.alex.com");
  });
});

describe("validateHostname", () => {
  it("accepts a subdomain", () => {
    expect(validateHostname("cv.alex.com", "queryme.app")).toEqual({ ok: true });
  });
  it("rejects a bare apex (<3 labels)", () => {
    expect(validateHostname("alex.com", null).ok).toBe(false);
  });
  it("rejects an invalid hostname", () => {
    expect(validateHostname("not a host", null).ok).toBe(false);
  });
  it("rejects platform-owned names", () => {
    expect(validateHostname("evil.queryme.app", "queryme.app").ok).toBe(false);
    expect(validateHostname("queryme.app", "queryme.app").ok).toBe(false);
  });
});

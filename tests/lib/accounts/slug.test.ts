import { describe, it, expect } from "vitest";
import { RESERVED_SLUGS, isReservedSlug, isValidUsername } from "@/lib/accounts/slug";

describe("isReservedSlug", () => {
  it("flags reserved top-level routes case-insensitively", () => {
    for (const s of ["about", "cv", "admin", "api", "login", "signup", "_next", "sitemap.xml", "favicon.ico"]) {
      expect(isReservedSlug(s)).toBe(true);
      expect(isReservedSlug(s.toUpperCase())).toBe(true);
    }
    expect(RESERVED_SLUGS.has("admin")).toBe(true);
  });
  it("reserves the auth top-level route", () => {
    expect(isReservedSlug("auth")).toBe(true);
  });
  it("does not flag ordinary usernames", () => {
    expect(isReservedSlug("alexcollet")).toBe(false);
  });
});

describe("isValidUsername", () => {
  it("accepts GitHub-style logins", () => {
    expect(isValidUsername("alexcollet")).toBe(true);
    expect(isValidUsername("a")).toBe(true);
    expect(isValidUsername("octo-cat")).toBe(true);
    expect(isValidUsername("a".repeat(39))).toBe(true);
  });
  it("rejects malformed, too-long, or reserved usernames", () => {
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername("-lead")).toBe(false);
    expect(isValidUsername("trail-")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("a".repeat(40))).toBe(false);
    expect(isValidUsername("admin")).toBe(false); // reserved
  });
});

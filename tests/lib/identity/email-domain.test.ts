import { describe, it, expect } from "vitest";
import { isLikelyWorkEmail, FREE_EMAIL_DOMAINS } from "@/lib/identity/email-domain";

describe("isLikelyWorkEmail", () => {
  it("accepts a normal corporate email", () => {
    expect(isLikelyWorkEmail("alice@acme.com")).toBe(true);
    expect(isLikelyWorkEmail("BoB@SomeCompany.io")).toBe(true);
  });

  it("rejects gmail / outlook / hotmail / yahoo / icloud / proton", () => {
    for (const d of ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"]) {
      expect(isLikelyWorkEmail(`x@${d}`)).toBe(false);
    }
  });

  it("rejects malformed input", () => {
    expect(isLikelyWorkEmail("")).toBe(false);
    expect(isLikelyWorkEmail("not-an-email")).toBe(false);
    expect(isLikelyWorkEmail("@no-local-part.com")).toBe(false);
    expect(isLikelyWorkEmail("no-at-symbol")).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isLikelyWorkEmail("x@GMAIL.COM")).toBe(false);
  });

  it("exports the canonical free-domain list", () => {
    expect(FREE_EMAIL_DOMAINS).toContain("gmail.com");
    expect(FREE_EMAIL_DOMAINS).toContain("outlook.com");
  });
});

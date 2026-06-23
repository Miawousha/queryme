import { describe, it, expect } from "vitest";
import { needsTosAcceptance } from "@/lib/accounts/guard";
import type { Account } from "@/lib/db/schema";

function acct(over: Partial<Account>): Account {
  return {
    id: "a1",
    githubId: "1",
    username: "u",
    role: "user",
    status: "active",
    plan: "free",
    createdAt: new Date(),
    tosAcceptedAt: null,
    ...over,
  } as Account;
}

describe("needsTosAcceptance", () => {
  it("active + never accepted → true", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: null }))).toBe(true);
  });
  it("active + accepted → false", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: new Date() }))).toBe(false);
  });
  it("waitlisted → false regardless of acceptance", () => {
    expect(needsTosAcceptance(acct({ status: "waitlisted", tosAcceptedAt: null }))).toBe(false);
  });
  it("disabled → false regardless of acceptance", () => {
    expect(needsTosAcceptance(acct({ status: "disabled", tosAcceptedAt: null }))).toBe(false);
  });
  it("treats undefined acceptance as not accepted", () => {
    expect(needsTosAcceptance(acct({ status: "active", tosAcceptedAt: undefined as unknown as null }))).toBe(true);
  });
});

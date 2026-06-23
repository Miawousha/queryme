import { describe, it, expect } from "vitest";
import { needsContentOnboarding } from "@/lib/admin/onboarding";
import type { PersonaSource } from "@/lib/db/schema";

const SYNCED: PersonaSource = {
  id: "ps1",
  accountId: "acc1",
  repoUrl: "https://github.com/alex/queritae-content",
  branch: "main",
  commitSha: "abc1234",
  status: "ok",
  error: null,
  syncedAt: new Date("2026-06-12T00:00:00.000Z"),
} as PersonaSource;

describe("needsContentOnboarding", () => {
  it("is true when the account has no active synced source", () => {
    expect(needsContentOnboarding(null)).toBe(true);
  });

  it("is false once an active source is synced", () => {
    expect(needsContentOnboarding(SYNCED)).toBe(false);
  });
});

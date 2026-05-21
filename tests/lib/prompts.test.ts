import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("buildSystemPromptParts", () => {
  it("returns header + kb", () => {
    const parts = buildSystemPromptParts({ kbText: "KB" });
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("kb");
  });

  it("the header mentions the forward marker but not identify", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    expect(parts[0].text).toContain("[[forward:");
    expect(parts[0].text).not.toContain("[[identify]]");
  });

  it("the header still mentions third person, EN/FR, citations, soft extrapolation", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    const header = parts[0].text.toLowerCase();
    expect(header).toContain("third person");
    expect(header).toMatch(/french|fran[cç]ais/);
    expect(header).toContain("english");
    expect(header).toMatch(/cite|citation/);
    expect(header).toMatch(/extrapolat|infer/);
  });
});

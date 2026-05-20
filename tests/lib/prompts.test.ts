import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("buildSystemPromptParts", () => {
  it("returns header + kb when no sensitive provided", () => {
    const parts = buildSystemPromptParts({ kbText: "KB" });
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("kb");
  });

  it("returns header + kb + sensitive when sensitive provided", () => {
    const parts = buildSystemPromptParts({ kbText: "KB", sensitiveKbText: "SENS" });
    expect(parts).toHaveLength(3);
    expect(parts[2].kind).toBe("sensitive");
    expect(parts[2].text).toContain("SENS");
    expect(parts[2].text).toContain("Sensitive knowledge base");
  });

  it("omits sensitive when sensitiveKbText is empty string", () => {
    const parts = buildSystemPromptParts({ kbText: "KB", sensitiveKbText: "" });
    expect(parts).toHaveLength(2);
  });

  it("the header mentions identify and forward markers", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    expect(parts[0].text).toContain("[[identify]]");
    expect(parts[0].text).toContain("[[forward:");
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

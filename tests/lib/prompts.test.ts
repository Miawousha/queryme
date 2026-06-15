import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";
import { CITATION_CONTRACT_INSTRUCTION } from "@/lib/kb/citations";

describe("buildSystemPromptParts", () => {
  it("returns header + contract + kb in order", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "KB" });
    expect(parts).toHaveLength(3);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("contract");
    expect(parts[2].kind).toBe("kb");
  });

  it("injects the platform citation contract verbatim as the contract part", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "KB" });
    const contract = parts.find((p) => p.kind === "contract");
    expect(contract?.text).toBe(CITATION_CONTRACT_INSTRUCTION);
  });

  it("the header mentions the forward marker but not identify", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "" });
    expect(parts[0].text).toContain("[[forward:");
    expect(parts[0].text).not.toContain("[[identify]]");
  });

  it("the header still mentions third person, EN/FR, citations, soft extrapolation", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "" });
    const header = parts[0].text.toLowerCase();
    expect(header).toContain("third person");
    expect(header).toMatch(/french|fran[cç]ais/);
    expect(header).toContain("english");
    expect(header).toMatch(/cite|citation/);
    expect(header).toMatch(/extrapolat|infer/);
  });
});

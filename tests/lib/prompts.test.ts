import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("buildSystemPromptParts", () => {
  it("returns a header part and a kb part, header before kb", () => {
    const parts = buildSystemPromptParts({ kbText: "KB GOES HERE" });
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("kb");
  });

  it("the kb part contains the kb text verbatim", () => {
    const parts = buildSystemPromptParts({ kbText: "KB GOES HERE" });
    expect(parts[1].text).toContain("KB GOES HERE");
  });

  it("the header mentions third-person voice, FR+EN, citations, and the soft-extrapolation policy", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    const header = parts[0].text.toLowerCase();
    expect(header).toContain("third person");
    expect(header).toMatch(/french|fran[cç]ais/);
    expect(header).toContain("english");
    expect(header).toMatch(/cite|citation/);
    expect(header).toMatch(/extrapolat|infer/);
  });
});

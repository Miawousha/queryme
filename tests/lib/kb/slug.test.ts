import { describe, it, expect } from "vitest";
import { slugify, normalizeAnchor, anchorMatches } from "@/lib/kb/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Battery Telemetry")).toBe("battery-telemetry");
  });

  it("strips punctuation but keeps letters, numbers, hyphens", () => {
    expect(slugify("Team & role (2025)")).toBe("team-role-2025");
  });

  it("collapses whitespace and hyphen runs, trims edge hyphens", () => {
    expect(slugify("  A  --  B  ")).toBe("a-b");
  });

  it("keeps accented letters (unicode-aware)", () => {
    expect(slugify("Équipe télémétrie")).toBe("équipe-télémétrie");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for all-punctuation input", () => {
    expect(slugify("!@#$")).toBe("");
  });
});

describe("normalizeAnchor / anchorMatches", () => {
  it("treats underscores and dots as hyphens", () => {
    expect(normalizeAnchor("team_role.2025")).toBe("team-role-2025");
  });

  it("matches a model-invented anchor against the real slug", () => {
    expect(anchorMatches("Battery-Telemetry", "battery-telemetry")).toBe(true);
    expect(anchorMatches("battery_telemetry", "battery-telemetry")).toBe(true);
  });

  it("rejects a different section", () => {
    expect(anchorMatches("overview", "battery-telemetry")).toBe(false);
  });
});

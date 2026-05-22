import { describe, it, expect } from "vitest";
import { extractCitedPaths } from "@/lib/kb/cited-paths";

describe("extractCitedPaths", () => {
  it("returns paths in first-seen order", () => {
    const texts = [
      "He worked at Altergo [^kb:experience/2025-altergo.md].",
      "His profile [^kb:profile.yaml] lists more.",
    ];
    expect(extractCitedPaths(texts)).toEqual([
      "experience/2025-altergo.md",
      "profile.yaml",
    ]);
  });

  it("de-duplicates a path cited more than once, keeping first position", () => {
    const texts = [
      "A [^kb:profile.yaml] then B [^kb:skills.yaml].",
      "Again [^kb:profile.yaml].",
    ];
    expect(extractCitedPaths(texts)).toEqual(["profile.yaml", "skills.yaml"]);
  });

  it("ignores an anchor when de-duplicating (path only)", () => {
    const texts = ["[^kb:profile.yaml#skills] and [^kb:profile.yaml#links]"];
    expect(extractCitedPaths(texts)).toEqual(["profile.yaml"]);
  });

  it("returns an empty array when there are no citations", () => {
    expect(extractCitedPaths(["plain text", ""])).toEqual([]);
  });
});

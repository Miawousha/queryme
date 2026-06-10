import { describe, it, expect } from "vitest";
import { parseCitations } from "@/lib/kb/citations";

describe("parseCitations", () => {
  it("extracts a single citation from text", () => {
    const text = "He founded Matrice in 2022 [^kb:experience/2022-matrice.md].";
    expect(parseCitations(text)).toEqual([
      { token: "[^kb:experience/2022-matrice.md]", path: "experience/2022-matrice.md", anchor: null },
    ]);
  });

  it("extracts citations with anchors", () => {
    const text = "Highlight A [^kb:experience/2022-matrice.md#highlights].";
    expect(parseCitations(text)).toEqual([
      { token: "[^kb:experience/2022-matrice.md#highlights]", path: "experience/2022-matrice.md", anchor: "highlights" },
    ]);
  });

  it("extracts multiple citations", () => {
    const text = "A [^kb:profile.yaml] and B [^kb:projects/x.md#summary] and C [^kb:skills.yaml].";
    const cites = parseCitations(text);
    expect(cites.map((c) => c.path)).toEqual(["profile.yaml", "projects/x.md", "skills.yaml"]);
    expect(cites[1].anchor).toBe("summary");
  });

  it("returns an empty array when no citations are present", () => {
    expect(parseCitations("plain text")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    expect(parseCitations("[^kb:]")).toEqual([]);
    expect(parseCitations("[^kb:../escape.md]")).toEqual([]); // no `..` allowed
  });

  it("accepts unicode anchors (accented heading slugs)", () => {
    const out = parseCitations("Voir [^kb:experience/2025-altergo.md#équipe-télémétrie].");
    expect(out).toEqual([
      {
        token: "[^kb:experience/2025-altergo.md#équipe-télémétrie]",
        path: "experience/2025-altergo.md",
        anchor: "équipe-télémétrie",
      },
    ]);
  });
});

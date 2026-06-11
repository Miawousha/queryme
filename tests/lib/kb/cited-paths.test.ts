import { describe, it, expect } from "vitest";
import { extractCitations, citedRefKey, citationIndexMap } from "@/lib/kb/cited-paths";

describe("extractCitations", () => {
  it("keeps anchors, assigns 1-based first-appearance indices and message ids", () => {
    const messages = [
      { id: "m1", text: "Altergo [^kb:experience/2025-altergo.md#battery-telemetry] built it." },
      { id: "m2", text: "Profile [^kb:profile.yaml] and again [^kb:experience/2025-altergo.md#battery-telemetry]." },
    ];
    expect(extractCitations(messages)).toEqual([
      { path: "experience/2025-altergo.md", anchor: "battery-telemetry", index: 1, messageId: "m1" },
      { path: "profile.yaml", anchor: null, index: 2, messageId: "m2" },
    ]);
  });

  it("treats different anchors on the same file as distinct refs", () => {
    const messages = [{ id: "m1", text: "[^kb:doc.md#a] [^kb:doc.md#b] [^kb:doc.md]" }];
    expect(extractCitations(messages).map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it("returns [] with no citations", () => {
    expect(extractCitations([{ id: "m1", text: "plain" }])).toEqual([]);
  });
});

describe("citedRefKey", () => {
  it("distinguishes anchored from anchorless refs", () => {
    expect(citedRefKey("doc.md", "a")).toBe("doc.md#a");
    expect(citedRefKey("doc.md", null)).toBe("doc.md");
  });
});

describe("citationIndexMap", () => {
  it("assigns global first-appearance numbers across messages and deduplicates", () => {
    const messages = [
      { id: "m1", text: "First [^kb:experience/a.md#s1] and second [^kb:profile.yaml]." },
      { id: "m2", text: "First again [^kb:experience/a.md#s1] and third [^kb:skills.yaml]." },
    ];
    const map = citationIndexMap(extractCitations(messages));
    expect(map["experience/a.md#s1"]).toBe(1);
    expect(map["profile.yaml"]).toBe(2);
    expect(map["skills.yaml"]).toBe(3);
    expect(Object.keys(map).length).toBe(3);
  });

  it("returns an empty map for an empty ref list", () => {
    expect(citationIndexMap([])).toEqual({});
  });
});

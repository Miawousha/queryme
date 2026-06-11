import { describe, it, expect } from "vitest";
import { extractCitations, citedRefKey } from "@/lib/kb/cited-paths";

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

/**
 * This mirrors the exact logic used in the `citationIndices` useMemo in
 * components/chat.tsx: build a Record<key, number> from extractCitations so
 * the chat superscripts always reflect global first-appearance order.
 *
 * chat.tsx renders this synchronously from `messages`, so there is no
 * context round-trip and no one-frame fallback window.
 * (chat.tsx itself cannot be rendered in the jsdom harness because it depends
 * on useChat / DefaultChatTransport from @ai-sdk/react which require a live
 * network transport; the pure logic is verified here instead.)
 */
describe("citationIndices memo pattern", () => {
  it("assigns global first-appearance numbers across messages", () => {
    const messages = [
      { id: "m1", text: "First [^kb:experience/a.md#s1] and second [^kb:profile.yaml]." },
      { id: "m2", text: "First again [^kb:experience/a.md#s1] and third [^kb:skills.yaml]." },
    ];
    const map: Record<string, number> = {};
    for (const r of extractCitations(messages)) {
      map[citedRefKey(r.path, r.anchor)] = r.index;
    }
    expect(map["experience/a.md#s1"]).toBe(1);
    expect(map["profile.yaml"]).toBe(2);
    expect(map["skills.yaml"]).toBe(3);
    // Repeated citation in m2 must NOT create a second entry.
    expect(Object.keys(map).length).toBe(3);
  });

  it("returns an empty map when there are no citations", () => {
    const map: Record<string, number> = {};
    for (const r of extractCitations([{ id: "m1", text: "No refs here." }])) {
      map[citedRefKey(r.path, r.anchor)] = r.index;
    }
    expect(map).toEqual({});
  });
});

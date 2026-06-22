import { describe, it, expect } from "vitest";
import { deriveLatestAnswer } from "@/lib/kb/latest-answer";
import { citedRefKey } from "@/lib/kb/cited-paths";

const idx: Record<string, number> = {
  [citedRefKey("experience/2021-ion.md", null)]: 1,
  [citedRefKey("experience/2025-altergo.md", "overview")]: 2,
};

describe("deriveLatestAnswer", () => {
  it("returns null when no assistant message cites anything", () => {
    expect(deriveLatestAnswer([{ id: "a", text: "no cites here" }], idx)).toBeNull();
    expect(deriveLatestAnswer([], idx)).toBeNull();
  });

  it("uses the most recent citing message and tags refs with its id + global index", () => {
    const out = deriveLatestAnswer(
      [
        { id: "a", text: "First [^kb:experience/2021-ion.md]." },
        { id: "b", text: "Then [^kb:experience/2025-altergo.md#overview]." },
      ],
      idx,
    );
    expect(out).toEqual({
      messageId: "b",
      refs: [{ path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" }],
    });
  });

  it("dedupes repeated cites within the same message, keeping first order", () => {
    const out = deriveLatestAnswer(
      [{ id: "b", text: "[^kb:experience/2025-altergo.md#overview] x [^kb:experience/2025-altergo.md#overview]" }],
      idx,
    );
    expect(out?.refs).toHaveLength(1);
  });

  it("surfaces a re-cited earlier source under the latest message (the key behavior)", () => {
    const out = deriveLatestAnswer(
      [
        { id: "a", text: "intro [^kb:experience/2021-ion.md]" },
        { id: "b", text: "follow-up re-cites [^kb:experience/2021-ion.md]" },
      ],
      idx,
    );
    expect(out).toEqual({
      messageId: "b",
      refs: [{ path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "b" }],
    });
  });

  it("drops cites whose key is absent from the index map", () => {
    const out = deriveLatestAnswer([{ id: "b", text: "[^kb:experience/unknown.md]" }], idx);
    expect(out).toBeNull();
  });
});

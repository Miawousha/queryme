import { describe, it, expect } from "vitest";
import { turnsToUiMessages, historyCitationKeys } from "@/lib/chat/history-messages";
import type { ConversationTurn } from "@/lib/db/schema";

function turn(role: "user" | "assistant", text: string): ConversationTurn {
  return { role, text, at: "2026-06-11T00:00:00.000Z" };
}

describe("turnsToUiMessages", () => {
  it("maps each turn to a single-text-part UI message with distinct ids", () => {
    const messages = turnsToUiMessages([
      turn("user", "What did you build at ION?"),
      turn("assistant", "A BMS platform. [^kb:experience/ion.md#battery-os]"),
    ]);

    expect(messages).toEqual([
      { id: "hist-0", role: "user", parts: [{ type: "text", text: "What did you build at ION?" }] },
      {
        id: "hist-1",
        role: "assistant",
        parts: [{ type: "text", text: "A BMS platform. [^kb:experience/ion.md#battery-os]" }],
      },
    ]);
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
  });

  it("skips empty-text turns but keeps ids index-stable", () => {
    // An assistant turn can persist as "" when the reply was tool-calls only;
    // rendering it would show an empty bubble.
    const messages = turnsToUiMessages([turn("user", "hi"), turn("assistant", ""), turn("assistant", "hello")]);

    expect(messages.map((m) => m.id)).toEqual(["hist-0", "hist-2"]);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("returns [] for an empty transcript", () => {
    expect(turnsToUiMessages([])).toEqual([]);
  });
});

describe("historyCitationKeys", () => {
  it("extracts citedRefKey-format keys from assistant messages only", () => {
    const keys = historyCitationKeys(
      turnsToUiMessages([
        // A user quoting citation syntax must not mute future pulses for it.
        turn("user", "What is [^kb:projects/queritae.md#stack] about?"),
        turn("assistant", "See [^kb:experience/ion.md#battery-os] and [^kb:experience/ion.md]."),
        turn("assistant", "Also [^kb:experience/ion.md#battery-os] again."),
      ]),
    );

    // Deduped, first-seen order, anchored key uses "path#anchor".
    expect(keys).toEqual(["experience/ion.md#battery-os", "experience/ion.md"]);
  });

  it("returns [] when nothing is cited", () => {
    expect(historyCitationKeys(turnsToUiMessages([turn("assistant", "No sources here.")]))).toEqual([]);
  });
});

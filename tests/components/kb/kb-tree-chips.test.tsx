/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbTree } from "@/components/kb/kb-tree";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

// ---------------------------------------------------------------------------
// Mock KbContext — KbTree reads strings/lang/groups/apiBasePath/seenAutoReveal
// and the chip → chat jump callback from it.
// ---------------------------------------------------------------------------

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  {
    path: "experience/2025-altergo.md",
    title: "2025 — Altergo",
    type: "md",
    sections: [
      { slug: "overview", title: "Overview", level: 2 },
      { slug: "battery-telemetry", title: "Battery telemetry", level: 2 },
    ],
  },
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
];

// Tree tests always need the FILES manifest and an "experience" group; wrap the
// shared factory with those defaults so individual tests stay readable.
function makeTreeCtx(overrides?: Partial<ReturnType<typeof useKb>>) {
  return makeKbContext({ manifest: FILES, groups: [{ name: "experience" }], ...overrides });
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  sessionStorage.clear();
});

describe("KbTree — citation chip buttons", () => {
  it("renders a doc chip as a real button, NOT nested inside the row button", () => {
    vi.mocked(useKb).mockReturnValue(makeTreeCtx());
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "msg-a" },
    ];

    render(<KbTree manifest={FILES} citedRefs={refs} onOpen={vi.fn()} />);

    const chip = screen.getByRole("button", { name: "Show citation 1 in chat" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveTextContent("[1]");
    // Sibling, not descendant: no ancestor of the chip is a button.
    expect(chip.parentElement?.closest("button")).toBeNull();
  });

  it("clicking a doc chip jumps to the citing message without opening the doc", async () => {
    const jumpToMessage = vi.fn();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    vi.mocked(useKb).mockReturnValue(makeTreeCtx({ jumpToMessage }));
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "msg-a" },
    ];

    render(<KbTree manifest={FILES} citedRefs={refs} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Show citation 1 in chat" }));
    expect(jumpToMessage).toHaveBeenCalledExactlyOnceWith("msg-a");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("the cited doc's row button still opens the doc", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    vi.mocked(useKb).mockReturnValue(makeTreeCtx());
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "msg-a" },
    ];

    render(<KbTree manifest={FILES} citedRefs={refs} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: /2021 — ION Energy/ }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("experience/2021-ion.md", null);
  });

  it("renders a section chip (auto-revealed) and jumps with its messageId", async () => {
    const jumpToMessage = vi.fn();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    vi.mocked(useKb).mockReturnValue(makeTreeCtx({ jumpToMessage }));
    const refs: CitedRef[] = [
      { path: "experience/2025-altergo.md", anchor: "battery-telemetry", index: 2, messageId: "msg-b" },
    ];

    render(<KbTree manifest={FILES} citedRefs={refs} onOpen={onOpen} />);

    // Auto-reveal expands the cited doc, so the section row is visible.
    const chip = screen.getByRole("button", { name: "Show citation 2 in chat" });
    expect(chip.parentElement?.closest("button")).toBeNull();
    await user.click(chip);
    expect(jumpToMessage).toHaveBeenCalledExactlyOnceWith("msg-b");

    // The section row button itself still opens the doc at the anchor.
    await user.click(screen.getByRole("button", { name: /Battery telemetry/ }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("experience/2025-altergo.md", "battery-telemetry");
  });

  it("chips are keyboard-reachable in the natural tab order", () => {
    vi.mocked(useKb).mockReturnValue(makeTreeCtx());
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "msg-a" },
    ];

    render(<KbTree manifest={FILES} citedRefs={refs} onOpen={vi.fn()} />);

    const chip = screen.getByRole("button", { name: "Show citation 1 in chat" });
    expect(chip).not.toHaveAttribute("tabindex");
    expect(chip).not.toBeDisabled();
  });

  it("renders no chip buttons when nothing is cited", () => {
    vi.mocked(useKb).mockReturnValue(makeTreeCtx());

    render(<KbTree manifest={FILES} citedRefs={[]} onOpen={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Show citation/ })).toBeNull();
  });
});

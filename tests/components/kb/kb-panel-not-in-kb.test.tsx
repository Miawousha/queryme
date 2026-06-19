/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbPanel } from "@/components/kb/kb-panel";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

// ---------------------------------------------------------------------------
// Mock the KB context — keep the real module exports, stub useKb.
// ---------------------------------------------------------------------------
vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KbPanel — notInKb dead-end", () => {
  beforeEach(() => {
    vi.mocked(useKb).mockReset();
  });

  it("renders the notInKb message when openTarget path is absent from the manifest", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({ openTarget: { path: "missing/doc.md", anchor: null }, manifest: [] }),
    );

    render(<KbPanel />);

    expect(screen.getByText("That document isn't in the knowledge base.")).toBeInTheDocument();
  });

  it("renders the back button in the top band for the notInKb state", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({ openTarget: { path: "missing/doc.md", anchor: null }, manifest: [] }),
    );

    render(<KbPanel />);

    // The button label is "‹ files" (strings.back prefixed with ‹ and a space).
    const btn = screen.getByRole("button", { name: "Back to the file list" });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent?.trim()).toBe("‹ files");
  });

  it("calls closeFile when the back button is clicked", async () => {
    const closeFile = vi.fn();
    const user = userEvent.setup();

    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        openTarget: { path: "missing/doc.md", anchor: null },
        manifest: [],
        closeFile,
      }),
    );

    render(<KbPanel />);

    await user.click(screen.getByRole("button", { name: "Back to the file list" }));
    expect(closeFile).toHaveBeenCalledOnce();
  });

  it("does NOT show the back button in the normal tree view", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({ openTarget: null, manifest: [] }),
    );

    render(<KbPanel />);

    expect(screen.queryByRole("button", { name: "Back to the file list" })).toBeNull();
    // The title band is shown instead.
    expect(screen.getByText("knowledge base")).toBeInTheDocument();
  });
});

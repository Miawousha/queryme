/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbDocToolbar } from "@/components/kb/kb-doc-toolbar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OUTLINE = [
  { slug: "intro", title: "Introduction", level: 2 as const },
  { slug: "details", title: "Details", level: 2 as const },
  { slug: "sub-detail", title: "A sub-section", level: 3 as const },
  { slug: "conclusion", title: "Conclusion", level: 2 as const },
];

function renderToolbar(outline = OUTLINE) {
  const onJumpTo = vi.fn();
  render(
    <KbDocToolbar
      title="My Document"
      backLabel="Back"
      onBack={vi.fn()}
      actions={[]}
      focused={false}
      onToggleFocus={vi.fn()}
      expandLabel="Expand"
      minimizeLabel="Minimize"
      outline={outline}
      onJumpTo={onJumpTo}
      outlineLabel="Outline"
      outlineAria="Jump to a section"
    />,
  );
  return { onJumpTo };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KbDocToolbar — outline dropdown keyboard a11y (option a: roving focus)", () => {
  it("opens the menu and focuses the first menuitem", async () => {
    const user = userEvent.setup();
    renderToolbar();

    const trigger = screen.getByRole("button", { name: "Jump to a section" });
    await user.click(trigger);

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveFocus();
  });

  it("ArrowDown moves focus to the next menuitem", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    await user.keyboard("{ArrowDown}");

    const items = screen.getAllByRole("menuitem");
    expect(items[1]).toHaveFocus();
  });

  it("ArrowUp moves focus to the previous menuitem", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    await user.keyboard("{ArrowDown}"); // → item[1]
    await user.keyboard("{ArrowUp}");  // → item[0]

    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
  });

  it("ArrowDown wraps from the last item to the first", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    await user.keyboard("{End}");       // jump to last
    await user.keyboard("{ArrowDown}"); // should wrap to first

    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
  });

  it("ArrowUp wraps from the first item to the last", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    // Focus lands on first item after open; ArrowUp wraps to last.
    await user.keyboard("{ArrowUp}");

    const items = screen.getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveFocus();
  });

  it("Home jumps to the first menuitem; End jumps to the last", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    const items = screen.getAllByRole("menuitem");

    await user.keyboard("{End}");
    expect(items[items.length - 1]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
  });

  it("Escape closes the menu and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    renderToolbar();

    const trigger = screen.getByRole("button", { name: "Jump to a section" });
    await user.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("trigger has aria-expanded=true when open, false when closed", async () => {
    const user = userEvent.setup();
    renderToolbar();

    const trigger = screen.getByRole("button", { name: "Jump to a section" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking a menuitem closes the menu and calls onJumpTo with the slug", async () => {
    const user = userEvent.setup();
    const { onJumpTo } = renderToolbar();

    await user.click(screen.getByRole("button", { name: "Jump to a section" }));
    await user.click(screen.getByRole("menuitem", { name: "Details" }));

    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(onJumpTo).toHaveBeenCalledWith("details");
  });
});

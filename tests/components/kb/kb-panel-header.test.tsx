/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbPanel } from "@/components/kb/kb-panel";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
  { path: "projects/graybox.md", title: "Graybox", type: "md" },
];

function ctx(overrides = {}) {
  return makeKbContext({
    manifest: FILES,
    groups: [{ name: "experience" }, { name: "projects" }],
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe("KbPanel header", () => {
  it("renders the filter input as its own full-width row", () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    render(<KbPanel />);
    expect(screen.getByPlaceholderText("Filter…")).toBeInTheDocument();
  });

  it("cited pill is disabled with no citations and toggles the lens when cited", async () => {
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" },
    ];
    vi.mocked(useKb).mockReturnValue(ctx({ citedRefs: refs }));
    const user = userEvent.setup();
    render(<KbPanel />);

    // Both collections visible initially.
    expect(screen.getByText("Projects")).toBeInTheDocument();

    const pill = screen.getByRole("button", { name: /referenced/i });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    await user.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");

    // Lens on → the non-cited "Projects" collection is pruned away.
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.getByText("Experience")).toBeInTheDocument();
  });

  it("density toggle flips data-kb-density and persists", async () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const user = userEvent.setup();
    const { container } = render(<KbPanel />);

    const scroll = container.querySelector("[data-kb-density]")!;
    expect(scroll).toHaveAttribute("data-kb-density", "compact");

    await user.click(screen.getByRole("button", { name: "Row spacing" }));
    expect(scroll).toHaveAttribute("data-kb-density", "comfortable");
    expect(localStorage.getItem("queritae:kbDensity")).toBe("comfortable");
  });

  it("shows a clear button only when the filter is non-empty and clears it on click", async () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const user = userEvent.setup();
    render(<KbPanel />);

    const input = screen.getByPlaceholderText("Filter…");
    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();

    await user.type(input, "ion");
    expect(input).toHaveValue("ion");

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
  });

  it("mounts the Sources strip above the tree when the latest answer cited something", () => {
    vi.mocked(useKb).mockReturnValue(
      ctx({
        latestAnswer: {
          messageId: "m1",
          refs: [{ path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" }],
        },
      }),
    );
    render(<KbPanel />);
    expect(screen.getByText("Sources · this answer")).toBeInTheDocument();
  });
});

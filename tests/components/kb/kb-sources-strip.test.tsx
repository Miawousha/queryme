/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbSourcesStrip } from "@/components/kb/kb-sources-strip";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  {
    path: "experience/2025-altergo.md",
    title: "2025 — Altergo",
    type: "md",
    sections: [{ slug: "overview", title: "Overview", level: 2 }],
  },
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
];

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  sessionStorage.clear();
});

describe("KbSourcesStrip", () => {
  it("renders nothing when there is no latest answer", () => {
    vi.mocked(useKb).mockReturnValue(makeKbContext({ manifest: FILES, latestAnswer: null }));
    const { container } = render(<KbSourcesStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the latest answer's sources in index order with section labels", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        latestAnswer: {
          messageId: "b",
          refs: [
            { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "b" },
            { path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" },
          ],
        },
      }),
    );
    render(<KbSourcesStrip />);
    expect(screen.getByText(/2021 — ION Energy/)).toBeInTheDocument();
    const altergo = screen.getByText(/2025 — Altergo/);
    expect(altergo).toBeInTheDocument();
    expect(altergo.closest("button")).toHaveTextContent("Overview");
  });

  it("drops refs whose path is missing from the manifest", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        latestAnswer: {
          messageId: "b",
          refs: [{ path: "ghost.md", anchor: null, index: 9, messageId: "b" }],
        },
      }),
    );
    const { container } = render(<KbSourcesStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking a row opens the viewer at that path + anchor", async () => {
    const openFile = vi.fn();
    const user = userEvent.setup();
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        openFile,
        latestAnswer: {
          messageId: "b",
          refs: [{ path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" }],
        },
      }),
    );
    render(<KbSourcesStrip />);
    await user.click(screen.getByRole("button", { name: /2025 — Altergo/ }));
    expect(openFile).toHaveBeenCalledExactlyOnceWith("experience/2025-altergo.md", "overview");
  });
});

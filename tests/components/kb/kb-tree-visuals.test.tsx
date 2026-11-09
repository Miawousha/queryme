/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KbTree } from "@/components/kb/kb-tree";
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
  { path: "projects/spec.pdf", title: "Spec", type: "pdf" },
];

function ctx(overrides = {}) {
  return makeKbContext({ manifest: FILES, groups: [{ name: "experience" }, { name: "projects" }], ...overrides });
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  sessionStorage.clear();
});

describe("KbTree — visuals", () => {
  it("shows a type glyph for a non-md doc and none for markdown", () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const { container } = render(<KbTree manifest={FILES} citedRefs={[]} onOpen={vi.fn()} />);
    expect(container.querySelector('[data-kb-glyph="pdf"]')).not.toBeNull();
    expect(container.querySelector('[data-kb-glyph="md"]')).toBeNull();
  });

  it("an expanded cited doc branch is marked with the trail rail", () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" },
    ];
    const { container } = render(<KbTree manifest={FILES} citedRefs={refs} onOpen={vi.fn()} />);
    // The cited doc's row container carries the trail marker.
    expect(container.querySelector("[data-kb-trail]")).not.toBeNull();
  });
});

describe("KbTree — inline metadata and active row", () => {
  const META_FILES: KbFile[] = [
    {
      path: "experience/2018-ion.md",
      title: "Battery platform",
      type: "md",
      meta: { company: "ION Energy", role: "CTO", start: "2018-01", end: "2022-05" },
    },
  ];

  it("renders company, role and period on the doc row itself", () => {
    vi.mocked(useKb).mockReturnValue(ctx({ manifest: META_FILES }));
    render(<KbTree manifest={META_FILES} citedRefs={[]} onOpen={vi.fn()} />);
    const row = screen.getByRole("button", { name: /Battery platform/ });
    expect(row).toHaveTextContent("ION Energy");
    expect(row).toHaveTextContent("CTO");
    expect(row).toHaveTextContent("2018 – 2022");
  });

  it("marks the doc open in the side viewer as current", () => {
    vi.mocked(useKb).mockReturnValue(ctx({ manifest: META_FILES }));
    render(
      <KbTree
        manifest={META_FILES}
        citedRefs={[]}
        onOpen={vi.fn()}
        active={{ path: "experience/2018-ion.md", anchor: null }}
      />,
    );
    expect(screen.getByRole("button", { name: /Battery platform/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

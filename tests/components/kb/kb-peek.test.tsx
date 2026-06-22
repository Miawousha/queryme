/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KbPeek } from "@/components/kb/kb-peek";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";
import type { PeekActive } from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILE: KbFile = { path: "experience/ion.md", title: "ION", type: "md" };
const rect = { top: 10, left: 100, right: 200, bottom: 30, width: 100, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect;

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  vi.mocked(useKb).mockReturnValue(makeKbContext());
});

describe("KbPeek", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<KbPeek active={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the loading label while loading", () => {
    const active: PeekActive = { file: FILE, target: { kind: "doc" }, rect, state: { status: "loading" } };
    render(<KbPeek active={active} />);
    expect(screen.getByText("Loading preview…")).toBeInTheDocument();
  });

  it("shows the title and the extracted excerpt when ready", () => {
    const active: PeekActive = {
      file: FILE,
      target: { kind: "doc" },
      rect,
      state: { status: "ready", text: "# ION\n\nBattery analytics for fleets." },
    };
    render(<KbPeek active={active} />);
    expect(screen.getByText("ION")).toBeInTheDocument();
    expect(screen.getByText("Battery analytics for fleets.")).toBeInTheDocument();
  });

  it("renders nothing on error", () => {
    const active: PeekActive = { file: FILE, target: { kind: "doc" }, rect, state: { status: "error" } };
    const { container } = render(<KbPeek active={active} />);
    expect(container.firstChild).toBeNull();
  });

  const FILE_WITH_SUMMARY: KbFile = { ...FILE, meta: { description: "Authored one-liner summary." } };

  it("doc: prefers the authored meta.description and shows it immediately (before the body loads)", () => {
    const active: PeekActive = {
      file: FILE_WITH_SUMMARY,
      target: { kind: "doc" },
      rect,
      state: { status: "loading" },
    };
    render(<KbPeek active={active} />);
    expect(screen.getByText("Authored one-liner summary.")).toBeInTheDocument();
    expect(screen.queryByText("Loading preview…")).toBeNull();
  });

  it("doc: still shows the authored summary even when the body fetch errors", () => {
    const active: PeekActive = {
      file: FILE_WITH_SUMMARY,
      target: { kind: "doc" },
      rect,
      state: { status: "error" },
    };
    render(<KbPeek active={active} />);
    expect(screen.getByText("Authored one-liner summary.")).toBeInTheDocument();
  });

  it("section: ignores the doc summary and uses the section body", () => {
    const active: PeekActive = {
      file: FILE_WITH_SUMMARY,
      target: { kind: "section", slug: "overview" },
      rect,
      state: { status: "ready", text: "## Overview\n\nOverview body.\n\n## Next\n\nx" },
    };
    render(<KbPeek active={active} />);
    expect(screen.getByText("Overview body.")).toBeInTheDocument();
    expect(screen.queryByText("Authored one-liner summary.")).toBeNull();
  });
});

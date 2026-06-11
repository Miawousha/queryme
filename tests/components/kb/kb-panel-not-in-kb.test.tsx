/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbPanel } from "@/components/kb/kb-panel";
import { useKb } from "@/components/kb/kb-context";
import type { KbStrings } from "@/lib/language";

// ---------------------------------------------------------------------------
// Mock the KB context — keep CV_VIRTUAL_PATH real, stub useKb.
// ---------------------------------------------------------------------------
vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KB_STRINGS: KbStrings = {
  title: "knowledge base",
  unavailable: "The knowledge base is unavailable.",
  referenced: "Referenced in this conversation",
  allDocuments: "All documents",
  notInKb: "That document isn't in the knowledge base.",
  back: "files",
  loading: "Loading…",
  loadError: "Couldn't load this file.",
  github: "GitHub",
  expand: "expand",
  minimize: "minimize",
  close: "close",
  details: "File details",
  showDetails: "Show file details",
  hideDetails: "Hide file details",
  backToList: "Back to the file list",
  expandFocus: "Expand to focus mode",
  exitFocus: "Exit focus mode",
  showPanel: "Show the knowledge base panel",
  closePanel: "Close the knowledge base panel",
  resizePanel: "Resize the knowledge base panel",
  panelLabel: "Knowledge base",
  copy: "Copy",
  copied: "Copied",
  copyAria: "Copy document content",
  download: "Download",
  downloadAria: "Download document",
  print: "Print",
  printAria: "Print or save as PDF",
  cv: "Curriculum Vitae",
  openCv: "Open CV",
  filterPlaceholder: "Filter…",
  clearFilter: "Clear filter",
  noMatches: "No documents match.",
  referencedLens: "Referenced",
  referencedLensAria: "Show only documents referenced in this conversation",
  outline: "Outline",
  outlineAria: "Jump to a section",
  citationJump: "Show citation {n} in chat",
  sections: {
    experience: "Experience",
    projects: "Projects",
    talks: "Talks",
    recommendations: "Recommendations",
    other: "Other",
  },
  expandGroup: "Expand",
  collapseGroup: "Collapse",
  meta: {
    company: "Company",
    role: "Role",
    period: "Period",
    location: "Location",
    year: "Year",
    link: "Link",
    stack: "Stack",
    tags: "Tags",
  },
};

function makeKbContext(overrides: Partial<ReturnType<typeof useKb>> = {}): ReturnType<typeof useKb> {
  return {
    lang: "en",
    strings: KB_STRINGS,
    manifest: [],
    groups: [],
    citedRefs: [],
    setCitedRefs: vi.fn(),
    seenAutoReveal: { current: new Set() },
    openTarget: null,
    openFile: vi.fn(),
    closeFile: vi.fn(),
    jumpToMessageHandler: { current: null },
    jumpToMessage: vi.fn(),
    onJumpToMessage: vi.fn(() => () => {}),
    apiBasePath: "/api",
    cvPrintBase: "",
    ...overrides,
  };
}

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

    render(<KbPanel onLangChange={vi.fn()} />);

    expect(screen.getByText("That document isn't in the knowledge base.")).toBeInTheDocument();
  });

  it("renders the back button in the top band for the notInKb state", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({ openTarget: { path: "missing/doc.md", anchor: null }, manifest: [] }),
    );

    render(<KbPanel onLangChange={vi.fn()} />);

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

    render(<KbPanel onLangChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Back to the file list" }));
    expect(closeFile).toHaveBeenCalledOnce();
  });

  it("does NOT show the back button in the normal tree view", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({ openTarget: null, manifest: [] }),
    );

    render(<KbPanel onLangChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Back to the file list" })).toBeNull();
    // The title band is shown instead.
    expect(screen.getByText("knowledge base")).toBeInTheDocument();
  });
});

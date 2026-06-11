/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { KbLayout } from "@/components/kb/kb-layout";
import { useIsDesktop } from "@/components/kb/use-media-query";
import { useKb } from "@/components/kb/kb-context";
import type { KbStrings } from "@/lib/language";

// ---------------------------------------------------------------------------
// Mock KbContext — KbLayout only reads strings from it.
// ---------------------------------------------------------------------------

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

// ---------------------------------------------------------------------------
// matchMedia mock factory
//
// useSyncExternalStore's subscribe() and getSnapshot() both call
// window.matchMedia(QUERY). Since vi.fn().mockReturnValue() returns the SAME
// object on every call, all calls share one mql instance:
//   - addEventListener wires into a shared listener set
//   - getSnapshot reads mql.matches which trigger() updates
// ---------------------------------------------------------------------------

type MockMql = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  /** Simulate a viewport change: updates matches and notifies subscribers. */
  trigger: (newMatches: boolean) => void;
};

function mockMatchMedia(matches: boolean): MockMql {
  const listeners = new Set<() => void>();
  const mql: MockMql = {
    matches,
    media: "(min-width: 640px)",
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change") listeners.add(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change") listeners.delete(cb);
    }),
    dispatchEvent: vi.fn(),
    trigger(newMatches: boolean) {
      mql.matches = newMatches;
      for (const cb of listeners) cb();
    },
  };
  // Every window.matchMedia(query) call returns the same mql instance.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

// ---------------------------------------------------------------------------
// Minimal KbStrings stub
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

function makeKbContext(): ReturnType<typeof useKb> {
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
    apiBasePath: "/api",
    cvPrintBase: "",
  };
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  vi.mocked(useKb).mockReturnValue(makeKbContext());
  // Reset localStorage so the width-restore effect doesn't interfere.
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// useIsDesktop — hook unit tests
// ---------------------------------------------------------------------------

describe("useIsDesktop", () => {
  it("returns false when matchMedia reports narrow viewport", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("returns true when matchMedia reports wide viewport", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("updates reactively when the viewport crosses the breakpoint (narrow → wide)", () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    act(() => mql.trigger(true));
    expect(result.current).toBe(true);
  });

  it("updates reactively when the viewport crosses the breakpoint (wide → narrow)", () => {
    const mql = mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);

    act(() => mql.trigger(false));
    expect(result.current).toBe(false);
  });

  it("cleans up the event listener on unmount", () => {
    const mql = mockMatchMedia(true);
    const { unmount } = renderHook(() => useIsDesktop());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// KbLayout — panel mounting counts
// ---------------------------------------------------------------------------

describe("KbLayout — single panel mount per breakpoint", () => {
  it("desktop: mounts exactly one panel instance (in the desktop pane)", () => {
    mockMatchMedia(true);

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    const panels = screen.getAllByTestId("kb-panel");
    expect(panels).toHaveLength(1);
    // The resize separator is the marker that the desktop pane is rendered.
    expect(screen.getByRole("separator")).toBeInTheDocument();
    // No mobile drawer trigger on desktop.
    expect(screen.queryByRole("button", { name: "KB" })).toBeNull();
  });

  it("mobile (drawer closed): panel not mounted at all", () => {
    mockMatchMedia(false);

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    // Panel not in DOM while drawer is closed.
    expect(screen.queryByTestId("kb-panel")).toBeNull();
    // No desktop separator.
    expect(screen.queryByRole("separator")).toBeNull();
    // Mobile trigger present.
    expect(screen.getByRole("button", { name: "KB" })).toBeInTheDocument();
  });

  it("mobile (drawer open): exactly one panel instance (in the drawer)", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    await user.click(screen.getByRole("button", { name: "KB" }));

    // The drawer is open — panel mounts once.
    const panels = screen.getAllByTestId("kb-panel");
    expect(panels).toHaveLength(1);
    // The drawer container is present.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Still no desktop separator.
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("crossing narrow → wide swaps without crash and shows one panel", () => {
    const mql = mockMatchMedia(false);

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    // Mobile: panel not mounted.
    expect(screen.queryByTestId("kb-panel")).toBeNull();

    // Simulate viewport growing past breakpoint.
    act(() => mql.trigger(true));

    // Desktop: exactly one panel.
    const panels = screen.getAllByTestId("kb-panel");
    expect(panels).toHaveLength(1);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "KB" })).toBeNull();
  });

  it("crossing wide → narrow swaps without crash and panel disappears", () => {
    const mql = mockMatchMedia(true);

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    // Desktop: one panel.
    expect(screen.getAllByTestId("kb-panel")).toHaveLength(1);

    // Simulate viewport shrinking below breakpoint.
    act(() => mql.trigger(false));

    // Mobile: panel unmounted (drawer closed).
    expect(screen.queryByTestId("kb-panel")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    // Mobile trigger appears.
    expect(screen.getByRole("button", { name: "KB" })).toBeInTheDocument();
  });

  it("drawer open on resize to desktop: drawer closes, desktop pane takes over", async () => {
    const mql = mockMatchMedia(false);
    const user = userEvent.setup();

    const panel = <div data-testid="kb-panel">PANEL</div>;
    render(
      <KbLayout chat={<div>chat</div>} panel={panel} />,
    );

    // Open the drawer.
    await user.click(screen.getByRole("button", { name: "KB" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Resize to desktop.
    act(() => mql.trigger(true));

    // Drawer should be gone, desktop pane takes over — still exactly one panel.
    expect(screen.queryByRole("dialog")).toBeNull();
    const panels = screen.getAllByTestId("kb-panel");
    expect(panels).toHaveLength(1);
  });
});

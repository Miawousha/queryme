/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { KbLayout } from "@/components/kb/kb-layout";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext, type KbFixture } from "@/tests/helpers/kb-fixtures";

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

  it("queries the correct media query string", () => {
    mockMatchMedia(true);
    renderHook(() => useIsDesktop());
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 640px)");
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

  it("mobile: a chip jump closes the drawer so the chat scroll is visible", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    const ctx = makeKbContext();
    vi.mocked(useKb).mockReturnValue(ctx);

    render(<KbLayout chat={<div>chat</div>} panel={<div>PANEL</div>} />);

    // Open the drawer — it covers the chat.
    await user.click(screen.getByRole("button", { name: "KB" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // A tree chip requests a jump → the drawer closes.
    act(() => ctx.jumpToMessage("m1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unsubscribes its jump listener on unmount", async () => {
    mockMatchMedia(false);
    const ctx: KbFixture = makeKbContext();
    vi.mocked(useKb).mockReturnValue(ctx);

    const { unmount } = render(<KbLayout chat={<div>chat</div>} panel={<div>PANEL</div>} />);
    // KbLayout subscribes exactly one listener (the drawer-close handler).
    expect(ctx._jumpListeners.size).toBe(1);
    unmount();
    // The effect cleanup must have unsubscribed it.
    expect(ctx._jumpListeners.size).toBe(0);
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

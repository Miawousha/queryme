/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKbPeek, clearPeekCache, OPEN_DELAY } from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";

const FILE: KbFile = { path: "experience/ion.md", title: "ION", type: "md" };

function mockHover(none: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: none, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

function el(): HTMLElement {
  const e = document.createElement("button");
  e.getBoundingClientRect = () => ({ top: 10, left: 100, right: 200, bottom: 30, width: 100, height: 20, x: 100, y: 10, toJSON: () => ({}) }) as DOMRect;
  return e;
}

beforeEach(() => {
  clearPeekCache();
  vi.useFakeTimers();
  mockHover(false);
});
afterEach(() => vi.useRealTimers());

describe("useKbPeek", () => {
  it("opens after OPEN_DELAY: loading then ready from the fetched text", async () => {
    // Defer the body resolution so the intermediate "loading" state is
    // observable: under React 19 + RTL's async `act`, an already-resolved
    // fetch would drain its whole .then chain inside the same flush as the
    // timer, so we'd jump straight to "ready". A controllable promise lets us
    // assert loading first, then resolve to assert ready.
    let resolveText!: (s: string) => void;
    const textP = new Promise<string>((res) => {
      resolveText = res;
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => textP });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useKbPeek("/api", "en"));
    act(() => result.current.show(el(), FILE, { kind: "doc" }));
    expect(result.current.active).toBeNull(); // not yet — within the delay

    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY);
    });
    expect(result.current.active?.state.status).toBe("loading");

    await act(async () => {
      resolveText("# ION\n\nbody");
      await Promise.resolve();
    });
    expect(result.current.active?.state).toEqual({ status: "ready", text: "# ION\n\nbody" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("does nothing on coarse pointers (hover: none)", () => {
    mockHover(true);
    const { result } = renderHook(() => useKbPeek("/api", "en"));
    act(() => result.current.show(el(), FILE, { kind: "doc" }));
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(result.current.active).toBeNull();
  });
});

/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKbTreeState } from "@/components/kb/use-kb-tree-state";
import type { CitedRef } from "@/lib/kb/cited-paths";
import type { KbFile } from "@/lib/kb/manifest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FILE: KbFile = { path: "experience/test.md", title: "Test Doc", type: "md" };
const CITED_REF: CitedRef = {
  path: "experience/test.md",
  anchor: null,
  index: 1,
  messageId: "msg1",
};
const GROUP_NAMES = new Set(["experience"]);
const STORAGE_KEY = "test-kb-tree-state";

function makeArgs(seenAutoReveal: { current: Set<string> }) {
  return {
    storageKey: STORAGE_KEY,
    files: [FILE],
    citedRefs: [CITED_REF],
    groupNames: GROUP_NAMES,
    seenAutoReveal,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useKbTreeState — auto-reveal dedup survives tree remount", () => {
  beforeEach(() => {
    // Freeze timers so the 1 600 ms pulse-clear never fires mid-assertion.
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("pulses the cited node on first render", () => {
    const seenAutoReveal = { current: new Set<string>() };

    const { result } = renderHook(() => useKbTreeState(makeArgs(seenAutoReveal)));

    // pulseId is set to the doc node id.
    expect(result.current.pulseId).toBe("doc:experience/test.md");
    // The key is recorded in the external ref after the effect runs.
    expect(seenAutoReveal.current.has("experience/test.md")).toBe(true);
  });

  it("does NOT re-pulse when remounted with the same seenAutoReveal ref (regression guard)", () => {
    const seenAutoReveal = { current: new Set<string>() };

    // First mount: auto-reveal fires, key is written into the external ref.
    const { unmount } = renderHook(() => useKbTreeState(makeArgs(seenAutoReveal)));
    unmount();

    // The set must outlive the unmount — this is the invariant the fix provides.
    expect(seenAutoReveal.current.has("experience/test.md")).toBe(true);

    // Second mount with THE SAME external ref: the cited key is already seen
    // → effect returns early without setting pulseId.
    const { result } = renderHook(() => useKbTreeState(makeArgs(seenAutoReveal)));
    expect(result.current.pulseId).toBeNull();
  });

  it("re-pulses when remounted with a FRESH Set (documents the old local-useRef bug)", () => {
    // First mount fills seenAutoReveal1.
    const seenAutoReveal1 = { current: new Set<string>() };
    const { unmount } = renderHook(() => useKbTreeState(makeArgs(seenAutoReveal1)));
    unmount();

    // Second mount with a fresh empty Set — exactly what the pre-fix local
    // `useRef` created on every mount inside the hook.
    const seenAutoReveal2 = { current: new Set<string>() };
    const { result } = renderHook(() => useKbTreeState(makeArgs(seenAutoReveal2)));

    // The cited ref is "new" from the fresh set's perspective → it re-pulses.
    // This test asserts that the old behaviour is reproducible with a fresh Set,
    // confirming that the second test above is a genuine regression guard.
    expect(result.current.pulseId).toBe("doc:experience/test.md");
  });
});

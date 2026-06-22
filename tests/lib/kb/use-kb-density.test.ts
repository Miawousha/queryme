/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKbDensity } from "@/lib/kb/use-kb-density";

beforeEach(() => localStorage.clear());

describe("useKbDensity", () => {
  it("defaults to compact", () => {
    const { result } = renderHook(() => useKbDensity());
    expect(result.current[0]).toBe("compact");
  });

  it("toggle flips to comfortable and persists", () => {
    const { result } = renderHook(() => useKbDensity());
    act(() => result.current[1]());
    expect(result.current[0]).toBe("comfortable");
    expect(localStorage.getItem("queritae:kbDensity")).toBe("comfortable");
  });

  it("rehydrates a persisted value on mount", () => {
    localStorage.setItem("queritae:kbDensity", "comfortable");
    const { result } = renderHook(() => useKbDensity());
    expect(result.current[0]).toBe("comfortable");
  });
});

import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "@/lib/theme";

describe("resolveInitialTheme", () => {
  it("uses a stored 'light' preference", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("light", false)).toBe("light");
  });

  it("uses a stored 'dark' preference", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("dark", true)).toBe("dark");
  });

  it("falls back to the OS setting when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignores an invalid stored value and falls back to the OS setting", () => {
    expect(resolveInitialTheme("sepia", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
});

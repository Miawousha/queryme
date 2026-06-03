import { describe, it, expect } from "vitest";
import { fmt } from "@/lib/admin/format";

describe("fmt", () => {
  it("renders an em dash for null / empty input", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt("")).toBe("—");
  });
  it("renders an em dash for an unparseable date string", () => {
    expect(fmt("not-a-date")).toBe("—");
  });
  it("renders a non-dash string for a valid date", () => {
    expect(fmt(new Date("2026-05-22T10:30:00Z"))).not.toBe("—");
    expect(fmt("2026-05-22T10:30:00Z")).not.toBe("—");
  });
});

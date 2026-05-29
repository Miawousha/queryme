import { describe, it, expect } from "vitest";
import {
  resolveOutputMode,
  renderSuccess,
  renderError,
} from "@/scripts/lib/admin-output";

describe("resolveOutputMode", () => {
  it("honors an explicit flag", () => {
    expect(resolveOutputMode("json", true)).toBe("json");
    expect(resolveOutputMode("pretty", false)).toBe("pretty");
  });
  it("defaults to pretty on a TTY and json when piped", () => {
    expect(resolveOutputMode(undefined, true)).toBe("pretty");
    expect(resolveOutputMode(undefined, false)).toBe("json");
  });
});

describe("renderSuccess", () => {
  it("emits a stable json envelope", () => {
    const out = renderSuccess("status", { active: null }, "IGNORED PRETTY", "json");
    expect(JSON.parse(out)).toEqual({
      ok: true,
      command: "status",
      result: { active: null },
    });
  });
  it("emits the pretty string in pretty mode", () => {
    expect(renderSuccess("status", { active: null }, "all good", "pretty")).toBe("all good");
  });
});

describe("renderError", () => {
  it("emits a stable json envelope with hint", () => {
    const out = renderError("sync", "boom", "try X", "json");
    expect(JSON.parse(out)).toEqual({
      ok: false,
      command: "sync",
      error: "boom",
      hint: "try X",
    });
  });
  it("omits hint when absent and formats pretty with Error/Hint lines", () => {
    expect(JSON.parse(renderError("sync", "boom", undefined, "json"))).toEqual({
      ok: false,
      command: "sync",
      error: "boom",
    });
    expect(renderError("sync", "boom", "try X", "pretty")).toBe("Error: boom\nHint: try X");
    expect(renderError("sync", "boom", undefined, "pretty")).toBe("Error: boom");
  });
});

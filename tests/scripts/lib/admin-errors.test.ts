import { describe, it, expect } from "vitest";
import { CliError } from "@/scripts/lib/admin-errors";

describe("CliError", () => {
  it("is an Error with message and optional hint", () => {
    const e = new CliError("boom", "do this");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("boom");
    expect(e.hint).toBe("do this");
    expect(e.name).toBe("CliError");
  });

  it("allows an omitted hint", () => {
    const e = new CliError("boom");
    expect(e.hint).toBeUndefined();
  });
});

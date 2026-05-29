import { describe, it, expect } from "vitest";
import { parseAdminArgs } from "@/scripts/lib/admin-args";

function ok(argv: string[]) {
  const r = parseAdminArgs(argv);
  if (r.kind !== "ok") throw new Error(`expected ok, got: ${JSON.stringify(r)}`);
  return r.parsed;
}
function usageError(argv: string[]) {
  const r = parseAdminArgs(argv);
  if (r.kind !== "usage-error") throw new Error(`expected usage-error, got: ${JSON.stringify(r)}`);
  return r.message;
}

describe("parseAdminArgs", () => {
  it("parses sync with positional repoUrl and flags", () => {
    const p = ok(["sync", "https://github.com/a/b", "--branch", "dev", "--remote", "https://x", "--dry-run"]);
    expect(p).toMatchObject({
      command: "sync",
      repoUrl: "https://github.com/a/b",
      branch: "dev",
      remote: "https://x",
      dryRun: true,
    });
  });

  it("parses bare sync (no repoUrl)", () => {
    const p = ok(["sync"]);
    expect(p).toMatchObject({ command: "sync", repoUrl: undefined, dryRun: false });
  });

  it("parses status and migrate", () => {
    expect(ok(["status", "--remote", "https://x"])).toMatchObject({ command: "status", remote: "https://x" });
    expect(ok(["migrate", "--dry-run"])).toMatchObject({ command: "migrate", dryRun: true });
  });

  it("resolves the output flag", () => {
    expect(ok(["status", "--json"]).outputFlag).toBe("json");
    expect(ok(["status", "--pretty"]).outputFlag).toBe("pretty");
    expect(ok(["status"]).outputFlag).toBeUndefined();
  });

  it("defaults to help when no command is given", () => {
    expect(ok([])).toMatchObject({ command: "help" });
  });

  it("rejects an unknown command", () => {
    expect(usageError(["frobnicate"])).toMatch(/unknown command/i);
  });

  it("rejects --json together with --pretty", () => {
    expect(usageError(["status", "--json", "--pretty"])).toMatch(/json.*pretty|pretty.*json/i);
  });

  it("rejects migrate with --remote", () => {
    expect(usageError(["migrate", "--remote", "https://x"])).toMatch(/migrate targets the database/i);
  });

  it("rejects an unexpected positional on status", () => {
    expect(usageError(["status", "extra"])).toMatch(/unexpected argument/i);
  });

  it("rejects an unknown flag", () => {
    expect(usageError(["status", "--nope"])).toMatch(/.+/);
  });
});

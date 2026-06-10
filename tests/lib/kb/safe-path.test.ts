import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { realpathWithin } from "@/lib/kb/safe-path";

describe("realpathWithin", () => {
  it("returns the real path for a regular file inside the dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-path-"));
    try {
      const file = path.join(dir, "ok.md");
      await fs.writeFile(file, "ok\n");
      await expect(realpathWithin(dir, file)).resolves.toBe(await fs.realpath(file));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("throws for a symlink that escapes the dir", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-path-"));
    try {
      const evil = path.join(dir, "leak.md");
      await fs.symlink("/etc/hosts", evil);
      await expect(realpathWithin(dir, evil)).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

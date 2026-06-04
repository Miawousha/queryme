import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadCvConfig } from "@/lib/kb/cv-config";

async function withTmpDir<T>(yaml: string | null, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-config-test-"));
  try {
    if (yaml !== null) await fs.writeFile(path.join(dir, "cv-config.yaml"), yaml, "utf8");
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("loadCvConfig", () => {
  it("parses section filters", async () => {
    await withTmpDir(`projects:\n  all: true\nexperience:\n  include:\n    - a\n`, async (dir) => {
      const cfg = await loadCvConfig(dir);
      expect(cfg?.projects).toEqual({ all: true });
      expect(cfg?.experience).toEqual({ include: ["a"] });
    });
  });

  it("rejects an unknown top-level key (strict schema)", async () => {
    await expect(
      withTmpDir(`chat:\n  featured_code:\n    - x\n`, (dir) => loadCvConfig(dir)),
    ).rejects.toThrow();
  });

  it("returns null when the file is absent", async () => {
    await withTmpDir(null, async (dir) => {
      expect(await loadCvConfig(dir)).toBeNull();
    });
  });
});

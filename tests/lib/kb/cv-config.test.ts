import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadCvConfig, getFeaturedCodeSlugs } from "@/lib/kb/cv-config";

async function withTmpDir<T>(yaml: string | null, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-config-test-"));
  try {
    if (yaml !== null) await fs.writeFile(path.join(dir, "cv-config.yaml"), yaml, "utf8");
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("loadCvConfig — chat block", () => {
  it("parses chat.featured_code as a list of slugs", async () => {
    await withTmpDir(
      `chat:\n  featured_code:\n    - repo-a\n    - repo-b\n`,
      async (dir) => {
        const cfg = await loadCvConfig(dir);
        expect(cfg?.chat?.featured_code).toEqual(["repo-a", "repo-b"]);
      },
    );
  });

  it("accepts a config with no chat block (back-compat)", async () => {
    await withTmpDir(`experience:\n  all: true\n`, async (dir) => {
      const cfg = await loadCvConfig(dir);
      expect(cfg?.chat).toBeUndefined();
    });
  });
});

describe("getFeaturedCodeSlugs", () => {
  it("returns the list when set", () => {
    expect(getFeaturedCodeSlugs({ chat: { featured_code: ["a", "b"] } })).toEqual(["a", "b"]);
  });

  it("returns null when the chat block is missing", () => {
    expect(getFeaturedCodeSlugs({})).toBeNull();
  });

  it("returns null when featured_code is missing", () => {
    expect(getFeaturedCodeSlugs({ chat: {} })).toBeNull();
  });

  it("returns null when the config itself is null", () => {
    expect(getFeaturedCodeSlugs(null)).toBeNull();
  });
});

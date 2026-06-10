import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import * as tar from "tar";
import { extractTarball } from "@/lib/persona-source";

/**
 * Builds an in-memory `.tar.gz` whose single top-level dir (`pkg/`, stripped by
 * extractTarball) contains a legit file and a symlink that escapes the tree —
 * exactly the shape a malicious synced persona repo would ship.
 */
async function makeMaliciousTarball(): Promise<Buffer> {
  const src = await fs.mkdtemp(path.join(os.tmpdir(), "tar-src-"));
  const pkg = path.join(src, "pkg");
  await fs.mkdir(path.join(pkg, "kb"), { recursive: true });
  await fs.writeFile(path.join(pkg, "kb", "profile.yaml"), "name: ok\n");
  await fs.symlink("/etc/hosts", path.join(pkg, "kb", "leak.md"));

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = tar.c({ cwd: src, gzip: true }, ["pkg"]);
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  await fs.rm(src, { recursive: true, force: true });
  return Buffer.concat(chunks);
}

describe("extractTarball — symlink safety", () => {
  it("extracts plain files but drops escaping symlink entries", async () => {
    const buf = await makeMaliciousTarball();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "tar-out-"));
    try {
      await extractTarball(buf, target);

      // The legit file is extracted (filter is not over-broad)...
      await expect(fs.readFile(path.join(target, "kb", "profile.yaml"), "utf8")).resolves.toContain(
        "name: ok",
      );

      // ...but the symlink must not exist on disk at all.
      await expect(fs.lstat(path.join(target, "kb", "leak.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await fs.rm(target, { recursive: true, force: true });
    }
  });
});

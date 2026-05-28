/**
 * MSW handlers for the two GitHub endpoints persona-source touches.
 * Tests configure the responses per case via `mswServer.use(...)`.
 */
import { http, HttpResponse } from "msw";
import { create as createTar } from "tar";
import type { Readable } from "node:stream";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const FAKE_SHA = "abc1234567890abcdef1234567890abcdef12345";

/**
 * Builds an in-memory tar.gz buffer containing the given files. Each entry
 * key is the relative path; the value is the file body.
 *
 * GitHub's codeload tarballs wrap files in a top-level `<repo>-<sha>/`
 * directory; we mimic that prefix so the extractor (strip:1) lands files
 * at the top of the cache dir.
 */
export async function makeTarball(
  files: Record<string, string>,
  prefix = `queryme-content-${FAKE_SHA}`,
): Promise<Buffer> {
  const stage = mkdtempSync(path.join(tmpdir(), "queryme-tarstage-"));
  try {
    const wrappedRoot = path.join(stage, prefix);
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(wrappedRoot, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body, "utf8");
    }
    const stream = createTar({ cwd: stage, gzip: true }, [prefix]) as unknown as Readable;
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export function happyPathHandlers(opts: {
  owner: string;
  repo: string;
  branch?: string;
  sha?: string;
  tarball: Buffer;
}) {
  const branch = opts.branch ?? "main";
  const sha = opts.sha ?? FAKE_SHA;
  return [
    http.get(
      `https://api.github.com/repos/${opts.owner}/${opts.repo}/commits/${branch}`,
      () => HttpResponse.json({ sha }),
    ),
    http.get(
      `https://codeload.github.com/${opts.owner}/${opts.repo}/tar.gz/${sha}`,
      () =>
        new HttpResponse(
          opts.tarball.buffer.slice(
            opts.tarball.byteOffset,
            opts.tarball.byteOffset + opts.tarball.byteLength,
          ) as ArrayBuffer,
          { headers: { "Content-Type": "application/x-gzip" } },
        ),
    ),
  ];
}

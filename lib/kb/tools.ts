import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Kb, RepoEntry } from "@/lib/kb/loader";

const PATH_RE = /^code\/[a-zA-Z0-9_-]+\.md$/;

const InputSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(5),
});

type LookupEntry = {
  path: string;
  name: string;
  body: string;
  frontmatter: RepoEntry["frontmatter"];
};

/**
 * Build the `lookup_code_entries` tool, closed over an in-memory map of code
 * entries by their canonical `[ref: code/<slug>.md]` path. The map is built
 * once per call to this factory — callers are expected to hand in the cached
 * Kb so this is effectively free.
 *
 * Path validation, unknown-slug handling, and over-cap inputs all return
 * structured responses to the model instead of throwing — a tool error would
 * abort the answer stream, and the model can recover from a structured
 * "notFound" list (apologize, or try a different path).
 */
export function buildKbLookupTools(kb: Kb): ToolSet {
  const byPath = new Map<string, RepoEntry>();
  for (const repo of kb.code) byPath.set(repo.relativePath, repo);

  return {
    lookup_code_entries: tool({
      description:
        "Fetch full bodies and metadata for code entries listed in the " +
        "'# Code (index)' section. Pass up to 5 ref paths (each like " +
        "'code/<slug>.md', matching the [ref: ...] markers in the index). " +
        "Returns each entry's body plus all frontmatter. Unknown paths land " +
        "in `notFound`; the request itself does not fail.",
      inputSchema: InputSchema,
      execute: async ({ paths }) => {
        const entries: LookupEntry[] = [];
        const notFound: string[] = [];
        for (const p of paths) {
          if (!PATH_RE.test(p)) {
            notFound.push(p);
            continue;
          }
          const hit = byPath.get(p);
          if (!hit) {
            notFound.push(p);
            continue;
          }
          entries.push({
            path: hit.relativePath,
            name: hit.frontmatter.name,
            body: hit.body,
            frontmatter: hit.frontmatter,
          });
        }
        return { entries, notFound };
      },
    }),
  };
}

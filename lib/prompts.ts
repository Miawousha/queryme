import fs from "node:fs";
import path from "node:path";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const file = path.resolve(process.cwd(), "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

/**
 * Returns the two-part system prompt: a static header and the dynamic KB blob.
 *
 * IMPORTANT: the header text MUST remain stable across requests. It is placed
 * BEFORE the prompt-caching breakpoint in `lib/answerer.ts`, so any per-request
 * variability in the header (e.g., asker greetings, timestamps) would silently
 * bust the cache for every call. Keep dynamic content in the messages, not here.
 */
export function buildSystemPromptParts(input: { kbText: string }): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
}

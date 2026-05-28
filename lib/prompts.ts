import fs from "node:fs";
import path from "node:path";
import { getActivePersonaRoot } from "@/lib/persona-source";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  const file = path.join(root, "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

/**
 * Returns the system-prompt parts in send-order: header, then public KB.
 *
 * IMPORTANT: the header text MUST remain stable across requests. It is placed
 * BEFORE the prompt-caching breakpoint in `lib/answerer.ts`, so any per-request
 * variability would silently bust the cache. Keep dynamic content out of the
 * header.
 */
export function buildSystemPromptParts(input: {
  kbText: string;
}): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
}

export function _resetPromptCache(): void {
  cachedHeader = null;
}

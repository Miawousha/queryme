import fs from "node:fs";
import path from "node:path";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string }
  | { kind: "sensitive"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const file = path.resolve(process.cwd(), "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

/**
 * Returns the system-prompt parts in send-order: header, then public KB,
 * then (optionally) sensitive KB.
 *
 * IMPORTANT: the header text MUST remain stable across requests. It is placed
 * BEFORE the prompt-caching breakpoint in `lib/answerer.ts`, so any per-request
 * variability would silently bust the cache. Keep dynamic content out of the
 * header; sensitive KB is the only per-request variable part, and it sits
 * AFTER the cached prefix.
 */
export function buildSystemPromptParts(input: {
  kbText: string;
  sensitiveKbText?: string;
}): SystemPromptPart[] {
  const parts: SystemPromptPart[] = [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
  if (input.sensitiveKbText && input.sensitiveKbText.length > 0) {
    parts.push({
      kind: "sensitive",
      text: `\n# Sensitive knowledge base\n\n${input.sensitiveKbText}\n`,
    });
  }
  return parts;
}

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

export function buildSystemPromptParts(input: { kbText: string }): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
}

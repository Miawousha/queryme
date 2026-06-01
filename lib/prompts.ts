import fs from "node:fs";
import path from "node:path";
import { getPersonaStore } from "@/lib/persona/store";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string };

const headerByAccount = new Map<string, string>();

function readHeader(accountId: string): string {
  const cached = headerByAccount.get(accountId);
  if (cached !== undefined) return cached;
  const root = getPersonaStore().getRoot(accountId);
  if (!root) throw new Error(`Persona not configured for account ${accountId}`);
  const file = path.join(root, "prompts/system.md");
  const text = fs.readFileSync(file, "utf8").trim();
  headerByAccount.set(accountId, text);
  return text;
}

/**
 * Returns the system-prompt parts in send-order: header, then public KB.
 * The header MUST stay stable across requests (it sits before the prompt-cache
 * breakpoint in lib/answerer.ts).
 */
export function buildSystemPromptParts(input: {
  accountId: string;
  kbText: string;
}): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader(input.accountId) },
    { kind: "kb", text: input.kbText },
  ];
}

export function _resetPromptCache(accountId?: string): void {
  if (accountId === undefined) { headerByAccount.clear(); return; }
  headerByAccount.delete(accountId);
}

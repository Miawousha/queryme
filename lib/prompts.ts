import fs from "node:fs";
import path from "node:path";
import { getPersonaStore } from "@/lib/persona/store";
import { CITATION_CONTRACT_INSTRUCTION } from "@/lib/kb/citations";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "contract"; text: string }
  | { kind: "kb"; text: string };

const MAX_ACCOUNTS = 50;
const headerByAccount = new Map<string, string>();

function readHeader(accountId: string): string {
  const cached = headerByAccount.get(accountId);
  if (cached !== undefined) {
    // Promote (LRU): re-insert so this account is most-recently-used.
    headerByAccount.delete(accountId);
    headerByAccount.set(accountId, cached);
    return cached;
  }
  const root = getPersonaStore().getRoot(accountId);
  if (!root) throw new Error(`Persona not configured for account ${accountId}`);
  const file = path.join(root, "prompts/system.md");
  const text = fs.readFileSync(file, "utf8").trim();
  headerByAccount.set(accountId, text);
  if (headerByAccount.size > MAX_ACCOUNTS) {
    headerByAccount.delete(headerByAccount.keys().next().value as string);
  }
  return text;
}

/**
 * Returns the system-prompt parts in send-order: the owner's header, the
 * platform-owned citation contract, then the public KB. The header MUST stay
 * stable across requests (it sits before the prompt-cache breakpoint in
 * lib/answerer.ts); the contract is a constant so it is cache-stable too.
 */
export function buildSystemPromptParts(input: {
  accountId: string;
  kbText: string;
}): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader(input.accountId) },
    { kind: "contract", text: CITATION_CONTRACT_INSTRUCTION },
    { kind: "kb", text: input.kbText },
  ];
}

export function _resetPromptCache(accountId?: string): void {
  if (accountId === undefined) { headerByAccount.clear(); return; }
  headerByAccount.delete(accountId);
}

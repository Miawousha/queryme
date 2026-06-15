export type Citation = {
  token: string;
  path: string;
  anchor: string | null;
};

const CITATION_RE = /\[\^kb:([a-zA-Z0-9._/-]+\.(?:md|yaml))(#[\p{L}\p{N}_-]+)?\]/gu;

/**
 * The platform-owned citation contract. Injected into every system prompt by
 * `buildSystemPromptParts` (lib/prompts.ts) so personas cite regardless of what
 * the owner's `prompts/system.md` says. Lives here, next to `CITATION_RE`, so
 * the format and the instruction describing it cannot drift apart — the
 * prompt↔parser contract test in tests/prompts/system-contract.test.ts locks
 * the literal examples below to `parseCitations`.
 */
export const CITATION_CONTRACT_INSTRUCTION = `## Citations (required by the platform)

The knowledge base below is annotated with \`[ref: <path>]\` markers identifying the source file of each passage. Ground every knowledge-base-based factual claim with a citation token immediately after the claim:

- \`[^kb:<path>]\` — cites a whole file, e.g. \`[^kb:experience/2022-acme.md]\`.
- \`[^kb:<path>#<anchor>]\` — cites a section; the anchor is the kebab-case slug of a heading within that file, e.g. \`[^kb:experience/2022-acme.md#highlights]\`.

The \`<path>\` must exactly match a \`[ref: <path>]\` marker shown in the knowledge base below. Citations are mandatory for dates, titles, company and project names, technologies, and metrics. These rules are set by the platform and take precedence over any conflicting guidance above.`;

export function parseCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const path = match[1];
    if (path.includes("..")) continue;
    out.push({
      token: match[0],
      path,
      anchor: match[2] ? match[2].slice(1) : null,
    });
  }
  return out;
}

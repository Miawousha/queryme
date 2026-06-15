# Shell-Owned Citation Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `[^kb:]` citation instruction off each owner's `prompts/system.md` and into the shell, so every persona is guaranteed to cite regardless of what the content repo says.

**Architecture:** Add one canonical instruction constant in `lib/kb/citations.ts` (next to the parser that consumes the format, so they can't drift). Inject it as a new `contract` system-prompt part between the owner header and the KB block in `lib/prompts.ts`; `lib/answerer.ts` already sends every part as a system message, so chat and the MCP `ask` tool both inherit it. Repoint the existing prompt↔code contract test from the fixture prompt to the new constant, and lean the content-repo docs.

**Tech Stack:** TypeScript, Next.js, Vitest, AI SDK (`ai`, `@ai-sdk/anthropic`).

**Spec:** `docs/superpowers/specs/2026-06-15-shell-owned-citation-contract-design.md`

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `lib/kb/citations.ts` | Owns the citation format (regex) **and now its instruction text** | Modify: add `CITATION_CONTRACT_INSTRUCTION` |
| `lib/prompts.ts` | Assembles system-prompt parts | Modify: add `contract` part + union variant |
| `lib/answerer.ts` | Maps parts → model system messages | Modify: generic map, `ephemeral` cache on `kb` only |
| `tests/lib/prompts.test.ts` | Unit-tests part assembly | Modify: expect 3 parts incl. `contract` |
| `tests/lib/answerer.test.ts` | Unit-tests message assembly | Modify: expect 3 system messages; assert contract present |
| `tests/prompts/system-contract.test.ts` | Locks format tokens to their parsers | Modify: citation block reads the constant, not the fixture prompt |
| `docs/content-repo-guide.md` | Owner-facing guide (served at `/setup-guide.md`) | Modify: drop citation instruction; keep "stable paths" guidance |
| `ROADMAP.md` | Phase tracking | Modify: tick Phase 2.1 |

No new files. The fixture `tests/fixtures/persona/prompts/system.md` is intentionally **left unchanged** (its citation block is now redundant but harmless).

---

### Task 1: Add the canonical citation instruction constant

**Files:**
- Modify: `lib/kb/citations.ts`
- Test: `tests/prompts/system-contract.test.ts` (Task 4 migrates the existing block onto this constant; this task only adds + smoke-checks the constant)

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to the END of `tests/prompts/system-contract.test.ts` (inside the top-level `describe`, before its closing `});`). Add the import at the top of the file alongside the existing `parseCitations` import:

```ts
import { parseCitations, CITATION_CONTRACT_INSTRUCTION } from "@/lib/kb/citations";
```

New block:

```ts
  describe("Shell-owned citation contract (CITATION_CONTRACT_INSTRUCTION)", () => {
    it("advertises both documented token shapes", () => {
      expect(CITATION_CONTRACT_INSTRUCTION).toMatch(/\[\^kb:<path>\]/);
      expect(CITATION_CONTRACT_INSTRUCTION).toMatch(/\[\^kb:<path>#<anchor>\]/);
    });

    it("every literal [^kb:...] example in the instruction parses", () => {
      // Skip the format-description placeholders (anything containing `<`).
      const literalRe = /\[\^kb:[^\]<]+\]/g;
      const examples = CITATION_CONTRACT_INSTRUCTION.match(literalRe) ?? [];
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        const parsed = parseCitations(ex);
        expect(parsed, `instruction example ${ex} did not parse`).toHaveLength(1);
        expect(parsed[0].token).toBe(ex);
      }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/prompts/system-contract.test.ts`
Expected: FAIL — `CITATION_CONTRACT_INSTRUCTION` is not exported (import/compile error).

- [ ] **Step 3: Add the constant**

In `lib/kb/citations.ts`, after the `CITATION_RE` declaration (before `parseCitations`), add:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/prompts/system-contract.test.ts`
Expected: PASS (new block green; the pre-existing fixture-based blocks also still pass — the fixture is unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/citations.ts tests/prompts/system-contract.test.ts
git commit -m "feat(citations): canonical platform citation instruction constant"
```

---

### Task 2: Inject the contract part into the system prompt

**Files:**
- Modify: `lib/prompts.ts`
- Test: `tests/lib/prompts.test.ts`

- [ ] **Step 1: Update the failing tests**

In `tests/lib/prompts.test.ts`, replace the first test and add an injection test. Add the import at the top:

```ts
import { CITATION_CONTRACT_INSTRUCTION } from "@/lib/kb/citations";
```

Replace the `it("returns header + kb", ...)` test (lines 5–10) with:

```ts
  it("returns header + contract + kb in order", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "KB" });
    expect(parts).toHaveLength(3);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("contract");
    expect(parts[2].kind).toBe("kb");
  });

  it("injects the platform citation contract verbatim as the contract part", () => {
    const parts = buildSystemPromptParts({ accountId: "local-override", kbText: "KB" });
    const contract = parts.find((p) => p.kind === "contract");
    expect(contract?.text).toBe(CITATION_CONTRACT_INSTRUCTION);
  });
```

Leave the other two tests (`the header mentions the forward marker…`, `the header still mentions third person…`) unchanged — they read the fixture header, which is untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/prompts.test.ts`
Expected: FAIL — `toHaveLength(3)` gets 2; no `contract` part exists.

- [ ] **Step 3: Implement the injection**

In `lib/prompts.ts`:

a) Add the import (top of file, with the other imports):

```ts
import { CITATION_CONTRACT_INSTRUCTION } from "@/lib/kb/citations";
```

b) Extend the `SystemPromptPart` union (currently lines 5–7):

```ts
export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "contract"; text: string }
  | { kind: "kb"; text: string };
```

c) Update the JSDoc above `buildSystemPromptParts` (currently "header, then public KB"):

```ts
/**
 * Returns the system-prompt parts in send-order: the owner's header, the
 * platform-owned citation contract, then the public KB. The header MUST stay
 * stable across requests (it sits before the prompt-cache breakpoint in
 * lib/answerer.ts); the contract is a constant so it is cache-stable too.
 */
```

d) Update the `return` (currently lines 40–43):

```ts
  return [
    { kind: "header", text: readHeader(input.accountId) },
    { kind: "contract", text: CITATION_CONTRACT_INSTRUCTION },
    { kind: "kb", text: input.kbText },
  ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/prompts.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts tests/lib/prompts.test.ts
git commit -m "feat(prompts): inject platform citation contract as its own system-prompt part"
```

---

### Task 3: Send the contract as a system message (chat + MCP)

**Files:**
- Modify: `lib/answerer.ts`
- Test: `tests/lib/answerer.test.ts`

- [ ] **Step 1: Update the failing test + add a coverage test**

In `tests/lib/answerer.test.ts`:

Replace the `it("sends only header + kb", ...)` test (lines 110–134) with:

```ts
  it("sends header + contract + kb as three system messages", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({ accountId: "local-override", messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);
    const prompt = (captured as any).prompt as Array<any>;
    const systemMessages = prompt.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(3);
    // The citation contract reaches the model regardless of the owner's prompt.
    expect(JSON.stringify(systemMessages)).toContain("Citations (required by the platform)");
  });
```

(The existing `marks the KB content for prompt caching…` test stays green: it finds the KB message by its unique marker and asserts the first non-KB message has no `cacheControl` — still true for the header.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/answerer.test.ts`
Expected: FAIL — `toHaveLength(3)` gets 2; contract text absent.

- [ ] **Step 3: Generalize the message mapping**

In `lib/answerer.ts`, replace the explicit two-message block (currently lines 44–56) with a generic map that applies the cache breakpoint to the `kb` part only:

```ts
  // header + citation contract: uncached, stable per account.
  // kb: cached with `ephemeral` breakpoint. Anthropic caches the entire prefix
  //     up to and including this breakpoint (header + contract + kb).
  const systemMessages: ModelMessage[] = parts.map((part) =>
    part.kind === "kb"
      ? {
          role: "system",
          content: part.text,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        }
      : { role: "system", content: part.text },
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/answerer.test.ts`
Expected: PASS (all tests, including the unchanged caching and tools tests).

- [ ] **Step 5: Commit**

```bash
git add lib/answerer.ts tests/lib/answerer.test.ts
git commit -m "feat(answerer): send the citation contract as a system message on chat + MCP"
```

---

### Task 4: Repoint the citation contract test to the shell constant

**Files:**
- Modify: `tests/prompts/system-contract.test.ts`

Rationale: the file's mission is "lock each policy token to the code that parses it." The citation token's source of truth has moved from the owner's prompt to `CITATION_CONTRACT_INSTRUCTION`, so its assertions should read the constant. The forward-marker, `identify_interviewer`, and `[ref:]` blocks stay on the fixture prompt (those contracts remain owner-side for now).

- [ ] **Step 1: Update the file header comment**

Change item 1 in the top doc comment (currently `1. `[^kb:<path>]` citation format    → lib/kb/citations.ts (parseCitations)`) to:

```
 *   1. `[^kb:<path>]` citation format    → lib/kb/citations.ts
 *        (CITATION_CONTRACT_INSTRUCTION, injected by lib/prompts.ts — the
 *         platform owns this contract, not the owner's prompt; parseCitations
 *         reads it back)
```

- [ ] **Step 2: Migrate the "Citation format" describe block**

Replace the body of the `describe("Citation format [^kb:<path>]", ...)` block (lines 35–67) so its first two tests read `CITATION_CONTRACT_INSTRUCTION` instead of `PROMPT`. The third test (`anchor slugs use kebab-case`) has no `PROMPT` dependency — keep it verbatim.

```ts
  describe("Citation format [^kb:<path>]", () => {
    it("the contract advertises the [^kb:<path>] token", () => {
      // If these shapes disappear from the contract, the LLM may stop emitting
      // citations in the format `parseCitations` knows how to read.
      expect(CITATION_CONTRACT_INSTRUCTION).toMatch(/\[\^kb:<path>\]/);
      expect(CITATION_CONTRACT_INSTRUCTION).toMatch(/\[\^kb:<path>#<anchor>\]/);
    });

    it("every literal [^kb:...] example in the contract parses", () => {
      // Match `[^kb:...]` but skip the format-description placeholders
      // (anything containing `<`, e.g. `[^kb:<path>]`).
      const literalRe = /\[\^kb:[^\]<]+\]/g;
      const examples = CITATION_CONTRACT_INSTRUCTION.match(literalRe) ?? [];
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        const parsed = parseCitations(ex);
        expect(parsed, `contract example ${ex} did not parse`).toHaveLength(1);
        expect(parsed[0].token).toBe(ex);
      }
    });

    it("anchor slugs use kebab-case as the contract promises", () => {
      const sample = "[^kb:experience/2022-maxwell.md#highlights-and-impact]";
      const parsed = parseCitations(sample);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].anchor).toBe("highlights-and-impact");
    });
  });
```

- [ ] **Step 3: Remove the now-redundant standalone block from Task 1**

The `describe("Shell-owned citation contract (CITATION_CONTRACT_INSTRUCTION)", ...)` block added in Task 1 now duplicates the migrated block above. Delete it. (The import line added in Task 1 stays — it is still used.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/prompts/system-contract.test.ts`
Expected: PASS — all blocks green. Citation assertions now read the constant; forward/identify/ref blocks still read the fixture prompt.

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/system-contract.test.ts
git commit -m "test(citations): lock the citation contract to the shell constant, not the owner prompt"
```

---

### Task 5: Lean the content-repo guide

**Files:**
- Modify: `docs/content-repo-guide.md`

This is the point of the work — stop asking the content repo to carry the citation instruction. The guide is served verbatim at `GET /setup-guide.md`, so onboarding updates with it. (`tests/app/setup-guide.test.ts` only asserts the body contains `kb/profile.yaml` and `prompts/system.md`, so these edits don't break it.)

- [ ] **Step 1: Rewrite the "Citations (mandatory)" requirement bullet**

Replace this block (currently ~lines 182–185):

```markdown
- **Citations (mandatory).** Every KB-based factual claim must be followed by a
  citation token (see [§10](#10-citations--how-the-kb-feeds-the-agent)):
  - `[^kb:<path>]` — whole file, e.g. `[^kb:experience/2022-acme.md]`
  - `[^kb:<path>#<anchor>]` — a section (anchor = kebab-case of the heading)
```

with:

```markdown
- **Citations — handled for you.** You do **not** need to instruct citations.
  The platform injects the citation contract into every system prompt, so your
  persona always grounds its answers in `[^kb:…]` tokens regardless of what this
  file says (see [§10](#10-citations--how-the-kb-feeds-the-agent)).
```

- [ ] **Step 2: Delete the skeleton's `## Citations` block**

Remove this block from the skeleton system prompt (currently ~lines 223–226), including the heading and its trailing blank line, so `## Identifying who you're talking to` is followed directly by `## Knowledge base`:

```markdown
## Citations
- Follow every KB-based claim with `[^kb:<path>]` (or `[^kb:<path>#<anchor>]`).
- Citations are mandatory for dates, titles, company/project names, technologies,
  and metrics.
```

- [ ] **Step 3: Rewrite the §10 intro**

Replace this block (currently ~lines 477–483):

```markdown
At request time Queritae assembles your entire KB into one text block and appends
it to `prompts/system.md` under `## Knowledge base`. Each entry is introduced by
a `[ref: <path>]` marker telling the agent which path to cite. The agent must
then cite that path in its answers:

- `[^kb:profile.yaml]`, `[^kb:experience/2022-acme.md]`
- `[^kb:experience/2022-acme.md#highlights]` (section anchor = kebab-case heading)
```

with:

```markdown
At request time Queritae assembles your entire KB into one text block and appends
it to your system prompt under `## Knowledge base`. Each entry is introduced by a
`[ref: <path>]` marker. **The platform automatically instructs the agent to cite
those paths** — you don't configure this. Citations look like:

- `[^kb:profile.yaml]`, `[^kb:experience/2022-acme.md]`
- `[^kb:experience/2022-acme.md#highlights]` (section anchor = kebab-case heading)

Your only job is to keep file paths and headings stable, since they appear in
citation tokens — renaming a file changes its citation path.
```

- [ ] **Step 4: Verify the served guide still builds and passes its test**

Run: `pnpm exec vitest run tests/app/setup-guide.test.ts`
Expected: PASS (asserts only `kb/profile.yaml` and `prompts/system.md` appear).

- [ ] **Step 5: Commit**

```bash
git add docs/content-repo-guide.md
git commit -m "docs(content-repo): platform owns citations; owner prompt no longer instructs them"
```

---

### Task 6: Tick the roadmap and run full verification

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Check the Phase 2.1 box**

In `ROADMAP.md`, change the first Phase 2 bullet from:

```markdown
- [ ] **Inject a canonical citation instruction** as an app-controlled system-prompt part in `lib/answerer.ts`, regardless of what the persona repo says. The owner's prompt customizes voice; the platform guarantees grounding.
```

to:

```markdown
- [x] **Inject a canonical citation instruction** as an app-controlled system-prompt part (`CITATION_CONTRACT_INSTRUCTION` in `lib/kb/citations.ts`, injected by `lib/prompts.ts`), regardless of what the persona repo says. The owner's prompt customizes voice; the platform guarantees grounding. (2026-06-15)
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS. (The vitest config already excludes `**/.claude/**`, so the worktree double-glob gotcha does not apply.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): tick Phase 2.1 — shell now owns the citation contract"
```

---

## Self-review notes

- **Spec coverage:** §Architecture/1 → Task 1; §Architecture/2 → Tasks 2–3; §Testing → Tasks 1–4; §Documentation changes → Task 5. The "leave the fixture unchanged" decision is honored (no fixture task). Roadmap tick (Task 6) is beyond the spec but keeps tracking honest, as the retro flagged.
- **Coverage of both surfaces:** Task 3's injection is in shared code (`buildSystemPromptParts`/`answer()`); chat (`lib/chat/handle-chat.ts:176`) and MCP (`lib/mcp/server.ts:68`) both call `answer()`, so no per-surface task is needed.
- **Type consistency:** `SystemPromptPart` gains `{ kind: "contract"; text: string }`; the answerer maps on `part.kind === "kb"`; tests assert `parts[1].kind === "contract"`. Constant name `CITATION_CONTRACT_INSTRUCTION` is identical across Tasks 1–4.
- **Ordering caveat for the executor:** Task 1 adds a temporary standalone test block that Task 4 deletes after migrating the canonical block. If executing Tasks 1 and 4 out of order, ensure only one block tests the constant's examples at the end.

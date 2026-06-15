# Shell-Owned Citation Contract

> Design approved 2026-06-15. Implements ROADMAP Phase 2.1 (Own the citation
> contract — the injection half). Sync-time ref linting (2.2) and the full
> end-to-end pipeline contract test (2.3) are deliberately deferred; see
> "Scope" below.

## Context & goal

Queritae's differentiator is **cited, verifiable answers**: every answer should
carry `[^kb:<path>#<anchor>]` tokens that the UI renders as citation chips
linking back to the exact knowledge-base section, and that feed citation
analytics.

The pipeline today is:

```
lib/kb/assembler.ts  →  emits [ref: <path>] markers before each KB passage
        ↓
the model            →  is told to echo [^kb:<path>#<anchor>] tokens
        ↓
lib/kb/citations.ts  →  parseCitations() extracts them (CITATION_RE)
        ↓
consumers            →  chip renderer (components/chat-message.tsx),
                        citation analytics (lib/admin/analytics.ts),
                        cited-paths (lib/kb/cited-paths.ts)
```

The break is in the middle. **The instruction to actually emit `[^kb:]` tokens
lives only in each owner's external `prompts/system.md`** (documented in
`docs/content-repo-guide.md` §"Citations (mandatory)" and §10). The shell emits
`[ref:]` markers but never tells the model to cite, and never validates that it
was told. An owner who writes — or later edits — a prompt without the citation
instruction gets a persona that **silently answers with zero citations**: no
chips, no grounding, flatlined analytics, and no error anywhere.

**Decision: the shell owns the citation contract, not the content repo.** The
platform injects a canonical, authoritative citation instruction into every
system prompt regardless of what the owner's prompt says. The owner's prompt is
reduced to what is genuinely theirs — voice, personality, persona description.
This follows the principle that *mechanical* concerns (citation format, the
`[ref:]`→`[^kb:]` contract) belong in the shell; the content repo should stay
lean.

This also collapses a split-brain: today the shell emits `[ref:]` but the owner
explains how to echo it. After this change the shell owns both halves.

## Scope

In scope (2.1):

- Inject an app-controlled citation instruction into the system prompt, covering
  both the chat surface and the MCP `ask` tool (both route through `answer()`).
- A single guard test locking the instruction text to the parser.
- Update `docs/content-repo-guide.md` so the content repo no longer carries the
  citation instruction (this doc is served verbatim at `/setup-guide.md`, so
  onboarding updates with it).

Explicitly out of scope:

- **Forward marker (`[[forward:…]]`) and `identify_interviewer` tool
  instructions** — also mechanical contracts currently in the owner's prompt,
  but they degrade gracefully if mis-stated (no silent loss of the headline
  feature). Deferred; the same pattern established here can move them later.
- **2.2 sync-time ref linting** — its original rationale (lint that the owner's
  prompt remembers citations) mostly evaporates once the shell owns the
  instruction.
- **2.3 full end-to-end pipeline contract test** (assembler → fixture model
  response → parse → render). The guard test below is a focused subset.

## Architecture

### 1. Single source of truth for the contract

Add an exported constant `CITATION_CONTRACT_INSTRUCTION` to `lib/kb/citations.ts`,
co-located with `CITATION_RE`. The file that *parses* the format also *owns the
text that describes it*, so the two cannot drift apart. No other module defines
or duplicates the instruction.

The instruction text (final wording may be tuned during implementation):

> **Citations (required by the platform).** The knowledge base below is
> annotated with `[ref: <path>]` markers identifying each passage's source file.
> Ground every KB-based factual claim with a citation token immediately after
> the claim: `[^kb:<path>]` for a whole file, or `[^kb:<path>#<anchor>]` for a
> section (anchor = kebab-case slug of a heading in that file). The `<path>`
> must exactly match a `[ref: <path>]` marker shown below. Citations are
> mandatory for dates, titles, company and project names, technologies, and
> metrics. These rules are set by the platform and take precedence over any
> conflicting guidance above.

- **English only.** It is a meta-instruction about output format; the model
  still detects and answers in the asker's language.
- **No owner opt-out.** Platform guarantee.
- **"take precedence over any conflicting guidance above"** handles the
  transition window where an owner's prompt still contains its own (now
  redundant, possibly contradictory) citation text — the shell wins without
  relying on positional priority.

### 2. Injection point and ordering

`buildSystemPromptParts` (`lib/prompts.ts`) gains a third part:

```
header   (owner's prompts/system.md — voice/persona)   [plain]
contract (CITATION_CONTRACT_INSTRUCTION)                [plain]   ← new
kb       (assembled KB text)                            [cache breakpoint]
```

The `SystemPromptPart` union gains a `{ kind: "contract"; text }` variant.

`answer()` (`lib/answerer.ts`) is generalized from hardcoded `parts[0]`/`parts[1]`
to map every part to a system message in order, applying the Anthropic
`ephemeral` `cacheControl` to the `kb` part only (unchanged behavior). Because
the breakpoint caches the entire prefix up to and including `kb`, the contract
part sits **inside the cached prefix** — it costs nothing on cache hits. The
constant is identical across all accounts and requests, so it never reduces
cache effectiveness.

Ordering rationale: instructions grouped (owner voice, then platform rules),
then data (KB) last, matching the existing "bulk content last" layout.

### 3. Coverage

Both entry points already call `answer()`:

- chat — `lib/chat/handle-chat.ts:176`
- MCP `ask` — `lib/mcp/server.ts:68`

Injecting in `buildSystemPromptParts` therefore covers both with no per-surface
code. No other system-prompt assembly path exists.

## Testing

One focused guard test (Vitest), not the full 2.3 pipeline test:

1. **Injection present.** `buildSystemPromptParts({...})` returns a part of kind
   `contract` whose text is `CITATION_CONTRACT_INSTRUCTION`, positioned between
   `header` and `kb`.
2. **Instruction ↔ parser locked.** Extract the example tokens embedded in
   `CITATION_CONTRACT_INSTRUCTION` and run them through `parseCitations()`;
   assert they parse to the expected `{path, anchor}` shapes. If a future edit
   changes the documented format without updating the regex (or vice-versa),
   this fails.

`answer()` itself is not re-tested for model behavior (it streams a live model);
the contract guarantees the *instruction is present and well-formed*, which is
the testable unit.

## Documentation changes (`docs/content-repo-guide.md`)

The point of the work — make the content repo lean:

- **Delete** the skeleton's `## Citations` block (currently lines ~223–226).
- **Rewrite** the "Citations (mandatory)" requirement (~182–185): from "your
  prompt must instruct citations" to "the platform injects the citation
  contract automatically — you don't need to mention it."
- **Rewrite** §10 ("Citations & how the KB feeds the agent"): keep the
  explanation of *how citations render* and the guidance that *file slugs/paths
  and headings must stay stable* (that is genuine content responsibility), but
  drop the instruction to tell the model to cite.

Served verbatim at `GET /setup-guide.md`, so the onboarding guide updates with
this edit; no separate onboarding change needed.

The fixture `tests/fixtures/persona/prompts/system.md` may keep its citation
section (now redundant but harmless); trimming it is optional cleanup, not
required by this design.

## What does not change

- The KB content contract: real files, headings/anchors, citation-stable slugs.
  Citations still resolve to real paths; renaming a file still changes its
  citation path. That is inherent to content, not a restated instruction.
- The assembler keeps emitting `[ref:]` markers exactly as today.
- `parseCitations`, the chip renderer, and citation analytics are unchanged.

## Risks

- **Token cost.** The instruction adds ~150 tokens to every request's cached
  prefix — negligible, and cached.
- **Transition redundancy.** Existing personas whose prompts still instruct
  citations will have two instructions. They agree; the shell's
  "take precedence" clause covers the rare contradiction. No action needed from
  owners.

# What the agent sees on every request

This is the actual content the chat agent (web `/api/chat` and MCP `/api/mcp`) is given each turn. Nothing here is dynamic relative to the conversation history — it's the stable prefix the model conditions on before reading the user's question.

## Layered view

Every request to `answer()` ([lib/answerer.ts](../lib/answerer.ts)) sends two system messages followed by the conversation:

```
┌────────────────────────────────────────────────────────────┐
│ system #1 (uncached)                                       │
│   prompts/system.md — voice, language, grounding,          │
│   citation rules, tool usage hints, identification policy  │
├────────────────────────────────────────────────────────────┤
│ system #2 (cached behind a single `ephemeral` breakpoint)  │
│   the assembled public KB:                                 │
│     # Profile                                              │
│     # Skills                                               │
│     # Education                                            │
│     # Public contact                                       │
│     # Experience           ← full bodies, every role       │
│     # Projects                                             │
│     # Talks                                                │
│     # Code (featured)      ← full bodies, ~17 curated      │
│     # Code (index)         ← one-line stubs, the rest      │
│     # Recommendations                                      │
├────────────────────────────────────────────────────────────┤
│ user / assistant messages                                  │
│   the conversation transcript so far, replayed each turn   │
└────────────────────────────────────────────────────────────┘
```

The split between system #1 and system #2 is deliberate: the header (#1) is small and cheap; the KB blob (#2) is large and lives behind a prompt-cache breakpoint, so every request after the first within ~5 minutes is a cache read, not a full reprocess. See [lib/answerer.ts](../lib/answerer.ts) and [lib/prompts.ts](../lib/prompts.ts).

## What lives where

| Block | Source | Size today | Cache |
|---|---|---:|---|
| system #1 header | [prompts/system.md](../prompts/system.md) | ~2.3k chars / ~660 tokens | uncached |
| system #2 KB | `assemblePublicKbText(kb, options)` in [lib/kb/assembler.ts](../lib/kb/assembler.ts) | ~75k chars / ~21.5k tokens with curation; ~152k / ~43k uncurated | `ephemeral` |
| conversation | the messages array from the request | varies | uncached |
| tools | `identify_interviewer` + `lookup_code_entries` | small (a few hundred tokens for schemas + descriptions) | uncached |

## How the KB blob is built

1. [`loadKb(rootDir, lang)`](../lib/kb/loader.ts) reads every YAML and Markdown file under `kb/` and validates it against the Zod schemas in [lib/kb/schemas.ts](../lib/kb/schemas.ts). The result is memoized per process by [`getCachedKb(lang)`](../lib/kb/cache.ts).
2. [`loadCvConfig(rootDir)`](../lib/kb/cv-config.ts) reads `cv-config.yaml` once. The `chat.featured_code` array names the slugs that get full-body inlining.
3. [`assemblePublicKbText(kb, { featuredCodeSlugs })`](../lib/kb/assembler.ts) renders each section. For `# Code`:
   - If `featuredCodeSlugs` is non-empty: featured entries render under `# Code (featured)` with full body + frontmatter; remaining entries render under `# Code (index)` as one-line stubs (name, description, tags, language, year, `[ref: code/<slug>.md]`).
   - Otherwise: a single `# Code` section with full bodies for every entry.
4. The assembled text is memoized by [`getCachedPublicKbText(lang)`](../lib/kb/cache.ts) and passed in as the second system message.

## Tools the agent can call mid-answer

Both surfaces (`/api/chat` and the MCP `ask` tool) merge two tool sets into the model call:

- **`identify_interviewer`** ([lib/interviewer/tool.ts](../lib/interviewer/tool.ts)) — record who's asking. The agent calls this when a visitor reveals their name, company, or role. The captured identity attaches to the conversation row in Postgres.
- **`lookup_code_entries`** ([lib/kb/tools.ts](../lib/kb/tools.ts)) — fetch the full body and frontmatter for up to 5 repos at a time, by their `[ref: code/<slug>.md]` paths. The agent calls this when the question touches a repo that's in `# Code (index)` rather than `# Code (featured)`. Returns `{ entries, notFound }`. Unknown or malformed paths land in `notFound` instead of throwing, so the answer stream never aborts.

The agent runs in a step loop (`stopWhen: stepCountIs(5)` in [lib/answerer.ts](../lib/answerer.ts)) so a single user turn can include a tool call → tool result → final answer (or two rounds of lookup before the final answer).

## End-to-end trace, walking through one question

A recruiter asks: *"Does Alexandre have Tauri experience?"*

1. The request hits `/api/chat`. The route loads the assembled KB text and the parsed Kb in parallel ([app/api/chat/route.ts](../app/api/chat/route.ts)).
2. `answer()` sends:
   - system #1: the header from `prompts/system.md`
   - system #2: the cached KB text (`# Profile` … `# Code (featured)` lists 17 repos with full bodies; `# Code (index)` lists 34 stubs)
   - user message: "Does Alexandre have Tauri experience?"
3. The model scans the prompt. `sirene` (a Tauri 2 desktop app) is in `# Code (featured)` with a full body, so the model answers directly from context and emits a citation `[^kb:code/sirene.md]`. No tool call.

Now imagine the recruiter follows up: *"What about a guitar-learning app he built?"*

1. Same prompt; the conversation now has both prior turns appended.
2. `string-theory` (a quest-based guitar skill platform) is NOT in featured — it's a one-line stub in `# Code (index)` with `[ref: code/string-theory.md]`.
3. The model calls `lookup_code_entries({ paths: ["code/string-theory.md"] })`. The tool returns the body + frontmatter from in-memory cache. The model writes the answer using that content and cites `[^kb:code/string-theory.md]`.

## Curation knob

The `chat:` block in [cv-config.yaml](../cv-config.yaml) is the only place that decides which repos get the expensive treatment:

```yaml
chat:
  featured_code:
    - queryme
    - aging-battery-lifetime-simulator
    # …
```

- Add a slug → that repo's body is in the prompt from the next process restart, ready to answer without a tool call.
- Remove a slug → it falls to the index, still findable but one round-trip slower.
- Omit `chat:` entirely → back-compat path; every repo gets full-body inlining (~43k tokens, no lookup tool needed for code questions).

The block lives in the same file as the CV print-curation knob so both surfaces' "what to feature" decisions are in one place.

## Why this layout

- The header is small and stable so Anthropic's prompt cache treats it as a constant prefix. Drift would invalidate the cache.
- The KB blob is big but rare-to-change (rebuilt only on process restart or when the cv-config changes). Caching it pays for itself within ~2 turns of any conversation.
- The featured/index split keeps the KB blob small enough to be cheap on cold cache, while the lookup tool still gives the agent reach into the long tail of repos.
- Tool descriptions tell the agent *when* to call which tool; the system header reinforces it under "Grounding policy"; the assembled `# Code (index)` section reminds it again at the point of use. Three pointers to the same contract because the model decides under uncertainty.

## Where to read the code

| File | What it does |
|---|---|
| [prompts/system.md](../prompts/system.md) | The header (voice, grounding, tool guidance) |
| [lib/prompts.ts](../lib/prompts.ts) | Reads the header once, exposes it as a stable string |
| [lib/answerer.ts](../lib/answerer.ts) | Builds the two-system-message structure with the cache breakpoint, calls `streamText` |
| [lib/kb/loader.ts](../lib/kb/loader.ts) | Parses every file under `kb/` |
| [lib/kb/assembler.ts](../lib/kb/assembler.ts) | Renders the KB as the text blob the agent reads |
| [lib/kb/cache.ts](../lib/kb/cache.ts) | Memoizes the parsed Kb and the assembled text per process |
| [lib/kb/cv-config.ts](../lib/kb/cv-config.ts) | Loads `cv-config.yaml`; exports `getFeaturedCodeSlugs` |
| [lib/kb/tools.ts](../lib/kb/tools.ts) | The `lookup_code_entries` tool factory |
| [lib/interviewer/tool.ts](../lib/interviewer/tool.ts) | The `identify_interviewer` tool factory |
| [app/api/chat/route.ts](../app/api/chat/route.ts) | Web chat handler — wires the tools into `answer()` |
| [lib/mcp/server.ts](../lib/mcp/server.ts) | MCP server — same wiring for the `ask` tool |

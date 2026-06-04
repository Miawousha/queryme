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
│     # Projects             ← each project lists its repos   │
│                              under a ### Repositories head   │
│     # Talks                                                │
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
| tools | `identify_interviewer` | small (a few hundred tokens for schemas + descriptions) | uncached |

## How the KB blob is built

1. [`loadKb(rootDir, lang)`](../lib/kb/loader.ts) reads every YAML and Markdown file under `kb/` and validates it against the Zod schemas in [lib/kb/schemas.ts](../lib/kb/schemas.ts). The result is memoized per process by [`getCachedKb(lang)`](../lib/kb/cache.ts).
2. [`loadCvConfig(rootDir)`](../lib/kb/cv-config.ts) reads `cv-config.yaml` once for the printable-CV section curation.
3. [`assemblePublicKbText(kb)`](../lib/kb/assembler.ts) renders each section, with each project rendering its repos listed beneath it under `### Repositories` (grounded on the project's `[ref: projects/<slug>.md]`). `allRepos(kb)` lives in [lib/kb/repos.ts](../lib/kb/repos.ts) (node-free, client-safe) and powers the aggregated CV/panel Repositories view.
4. The assembled text is memoized by [`getCachedPublicKbText(lang)`](../lib/kb/cache.ts) and passed in as the second system message.

## Tools the agent can call mid-answer

Both surfaces (`/api/chat` and the MCP `ask` tool) wire the same tool into the model call:

- **`identify_interviewer`** ([lib/interviewer/tool.ts](../lib/interviewer/tool.ts)) — record who's asking. The agent calls this when a visitor reveals their name, company, or role. The captured identity attaches to the conversation row in Postgres.

The agent runs in a step loop (`stopWhen: stepCountIs(5)` in [lib/answerer.ts](../lib/answerer.ts)) so a single user turn can include a tool call → tool result → final answer.

## End-to-end trace, walking through one question

A recruiter asks: *"Does Alexandre have Tauri experience?"*

1. The request hits `/api/chat`. The route loads the assembled KB text and the parsed Kb in parallel ([app/api/chat/route.ts](../app/api/chat/route.ts)).
2. `answer()` sends:
   - system #1: the header from `prompts/system.md`
   - system #2: the cached KB text (`# Profile` … `# Projects`, where each project lists its repos under a `### Repositories` subheading)
   - user message: "Does Alexandre have Tauri experience?"
3. The model scans the prompt. `sirene` (a Tauri 2 desktop app) is a repo listed under its parent project in `# Projects` with a full body, so the model answers directly from context and cites the parent project `[^kb:projects/<slug>.md]`. No tool call.

## Curation knob

[cv-config.yaml](../cv-config.yaml) curates the printable CV's sections (and, via the `projects` filter, which projects — and therefore which repos — appear). The full KB is always inlined into the chat prompt; there is no per-repo featuring or on-demand fetch.

## Why this layout

- The header is small and stable so Anthropic's prompt cache treats it as a constant prefix. Drift would invalidate the cache.
- The KB blob is big but rare-to-change (rebuilt only on process restart or when the cv-config changes). Caching it pays for itself within ~2 turns of any conversation.
- Repos nest under their parent project, so the whole KB inlines once and every repo fact grounds on its project's existing citation path. No long-tail split, no lookup round-trip.

## Where to read the code

| File | What it does |
|---|---|
| [prompts/system.md](../prompts/system.md) | The header (voice, grounding, tool guidance) |
| [lib/prompts.ts](../lib/prompts.ts) | Reads the header once, exposes it as a stable string |
| [lib/answerer.ts](../lib/answerer.ts) | Builds the two-system-message structure with the cache breakpoint, calls `streamText` |
| [lib/kb/loader.ts](../lib/kb/loader.ts) | Parses every file under `kb/` |
| [lib/kb/assembler.ts](../lib/kb/assembler.ts) | Renders the KB as the text blob the agent reads |
| [lib/kb/repos.ts](../lib/kb/repos.ts) | `allRepos(kb)` — flat-maps every project's repos for the aggregated Repositories view (node-free, client-safe) |
| [lib/kb/cache.ts](../lib/kb/cache.ts) | Memoizes the parsed Kb and the assembled text per process |
| [lib/kb/cv-config.ts](../lib/kb/cv-config.ts) | Loads `cv-config.yaml` for CV section curation |
| [lib/interviewer/tool.ts](../lib/interviewer/tool.ts) | The `identify_interviewer` tool factory |
| [app/api/chat/route.ts](../app/api/chat/route.ts) | Web chat handler — wires the tool into `answer()` |
| [lib/mcp/server.ts](../lib/mcp/server.ts) | MCP server — same wiring for the `ask` tool |

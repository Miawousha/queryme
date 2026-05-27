# Featured code entries + on-demand lookup tool

## Problem

The chat agent's system prompt is dominated by the `kb/code` section. Measured against the current public KB:

| Section | Chars | % of KB |
|---|---:|---:|
| `# Code` (103 entries, full bodies) | 137,128 | 90.4% |
| `# Experience` (10 roles, full bodies) | 12,722 | 8.4% |
| Everything else | ~1,900 | 1.2% |
| **Total assembled** | **151,771** | **100%** |

That's ~43k tokens shipped on every chat turn. Anthropic prompt caching covers it after the first turn within the 5-minute TTL, but every cold conversation (and every cache miss on a public chatbot) pays the full bill. Recent commits expanded each `kb/code` entry with `What` / `Tech` / `Status` sections, which is what pushed `# Code` to 90% of the prompt. Most interviewer questions don't need 103 repos worth of detail — they ask about 1-3.

## Goal

Drop the cached system prompt from ~43k tokens to ~22k tokens (~44%) without losing the agent's ability to answer in-depth questions about any repo.

## Approach

Combine two changes:

1. **Featured set inlined.** A hand-curated ~10-15 repos render exactly as today — full body and frontmatter — under `# Code (featured)`.
2. **Everything else indexed.** Remaining repos render as one-line stubs (name, description, tags, language, year, ref path) under `# Code (index)`. The agent fetches full bodies on demand via a new `lookup_code_entries` tool.

## Curation config

Extend `cv-config.yaml` with a new top-level `chat` block:

```yaml
chat:
  featured_code:
    - aging_battery_lifetime_simulator
    - <slug>
    - <slug>
    # ordered, ~10-15 entries
```

- Slug = file basename without `.md`, same convention as `experience.include`.
- Unknown slugs warn but do not fail (consistent with existing `cv-config.yaml` behaviour).
- If `chat` is omitted or `featured_code` is missing/empty, behaviour falls back to **all repos featured** — today's behaviour. Migration is opt-in and safe.

The `chat` block is intentionally separate from the existing `code:` block (which curates the printed CV). The two surfaces have genuinely different selection criteria; co-locating them in one file keeps curation discoverable without forcing them to be the same list.

## Config loader

`lib/kb/cv-config.ts` already loads and parses this file. Extend its schema with:

```ts
chat?: {
  featured_code?: string[];
};
```

Expose `getFeaturedCodeSlugs(): string[] | null` where `null` means "no featured list configured → ship everything" (back-compat).

## Assembler change — `lib/kb/assembler.ts`

`renderRepos(kb)` splits into two renderers, both gated on `getFeaturedCodeSlugs()`:

**`# Code (featured)`** — for each slug in `featured_code` that resolves to a known repo, render exactly as today (`renderFeaturedRepoEntry`, body and all frontmatter intact).

**`# Code (index)`** — for every remaining repo, one stub:

```
- <name> — <description>
  tags: [<tag>, <tag>], language: <lang>, year: <year>
  [ref: code/<slug>.md]
```

(The `[ref: ...]` prefix is `code/`, not `kb/code/`, to match the existing assembler convention — citations elsewhere in the prompt look the same.)

Fields included in the stub (per the answered design questions):
- `name`, `description` (always)
- `tags`, `language`, `year` (when present)
- `[ref:]` path (always — this is the lookup key)

Fields **excluded** from the stub (available via lookup): `role`, `visibility`, `url`, `stars`, `code_bytes`, `last_active`, `archived`, full body.

Append a trailing instruction to the index section:

> These additional repos are not pre-loaded. Call `lookup_code_entries` with the `[ref: ...]` paths above to fetch full bodies before answering questions about them.

This instruction lives in the assembled KB body — not in `prompts/system.md` — so the cache-stable header remains untouched.

When `featured_code` is `null` or empty, fall back to today's single `# Code` section with full bodies for all entries.

## Lookup tool — `lib/kb/tools.ts` (new file)

```ts
export function buildKbLookupTools(kb: Kb): ToolSet {
  return {
    lookup_code_entries: tool({
      description:
        "Fetch full bodies and metadata for code entries listed in the " +
        "`# Code (index)` section. Pass up to 5 ref paths (e.g. " +
        "`kb/code/<slug>.md`). Returns each entry's body plus all frontmatter.",
      inputSchema: z.object({
        paths: z.array(z.string()).min(1).max(5),
      }),
      execute: async ({ paths }) => { /* ... */ },
    }),
  };
}
```

**Response shape:**

```ts
{
  entries: Array<{
    path: string;
    name: string;
    body: string;
    frontmatter: Record<string, unknown>;
  }>;
  notFound: string[];
}
```

**Behaviour:**

- **Cap enforcement:** Zod `.max(5)` rejects oversize inputs at the SDK boundary; the model sees a tool error and retries.
- **Path validation:** Must match `^code/[a-zA-Z0-9_-]+\.md$`. Reject otherwise (in `notFound`).
- **Source:** In-process cache of the parsed `Kb` object (the same data already loaded by `getCachedPublicKbText`). Build a `Map<path, codeEntry>` once per (process, language) and reuse. Zero disk I/O on hot path.
- **Unknown paths:** Returned in `notFound[]`, not thrown. The model decides whether to retry or apologize.
- **Sync return:** Pure memory lookup. No DB, no network.

Tool factory takes `Kb` (not a fetcher) so the closure is testable without going through the cache layer.

## KB cache extension — `lib/kb/cache.ts`

Today: `getCachedPublicKbText(lang)` returns the assembled text only. The parsed `Kb` object is loaded inside, used once, and discarded.

After: also cache the parsed `Kb` per language, and expose `getCachedKb(lang)` so `buildKbLookupTools` can build its lookup map from the same data.

```ts
const parsedKbByLang = new Map<KbLang, Kb>();

export async function getCachedKb(lang: KbLang = "en"): Promise<Kb> { /* ... */ }
export async function getCachedPublicKbText(lang: KbLang = "en"): Promise<string> {
  /* uses getCachedKb internally */
}
```

## Wiring — `app/api/chat/route.ts`

```ts
const [publicKbText, parsedKb] = await Promise.all([
  getCachedPublicKbText(lang),
  getCachedKb(lang),
]);

const result = await answer({
  messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
  kbText: publicKbText,
  tools: {
    ...buildIdentifyTools((identity) => setInterviewer(db, conversationId, identity)),
    ...buildKbLookupTools(parsedKb),
  },
});
```

`lib/answerer.ts` already accepts a `tools: ToolSet` and already sets `stopWhen: stepCountIs(5)`. No change needed there — the step ceiling comfortably covers `identify_interviewer` + 2-3 `lookup_code_entries` rounds.

## System prompt header — `prompts/system.md`

Add a short paragraph under the existing "Grounding policy" section:

> The `# Code (index)` section lists additional repos not pre-loaded into context. When a question would benefit from one of them, call `lookup_code_entries` with up to 5 paths (the `[ref: code/<slug>.md]` markers in the index) to fetch their full bodies before answering. Prefer the featured entries when the question is general; use lookup when the question names a specific project, language, or tag that isn't covered by the featured set.

Estimated cost: ~80 tokens added to the uncached header.

## Error handling

| Failure mode | Behaviour |
|---|---|
| Tool input over cap | Zod rejects → SDK returns error to model → model retries with fewer paths |
| Invalid path format | Listed in `notFound[]`; tool returns `ok` with empty `entries[]` if all bad |
| Unknown slug (valid format, no matching file) | Listed in `notFound[]` |
| `chat.featured_code` references unknown slug at boot | Warn at boot, ship the rest; missing slug silently skipped |
| Malformed `cv-config.yaml` | Existing config loader behaviour preserved (fail fast at boot) |
| KB cache miss for a slug that *is* in the index | Should be impossible; returned in `notFound[]` if it happens |

No path through `lookup_code_entries.execute` throws.

## Testing

**`lib/kb/assembler.test.ts`:**
- With `chat.featured_code` set: featured entries render full body; non-featured render as index stubs with name/description/tags/language/year/ref only.
- With `chat.featured_code` omitted or empty: legacy behaviour — single `# Code` section, all bodies.
- Unknown slug in `featured_code`: warned, skipped, build succeeds.
- Index trailing instruction present iff index section present.

**`lib/kb/tools.test.ts`:**
- Happy path: 3 valid paths return 3 entries with body + frontmatter.
- Path validation: traversal (`code/../sensitive/foo.md`), wrong prefix, missing `.md` → `notFound[]`.
- Cap: 6 paths → Zod rejects; 5 paths → OK.
- Mixed valid + unknown → `entries[]` has the valid ones, `notFound[]` has the rest.

**Integration (extend existing chat e2e if present, otherwise add one):**
- Question about a featured repo → answered without tool call.
- Question naming a non-featured repo by description match → agent calls `lookup_code_entries` once, then answers with a citation to that repo's ref.

## Token impact estimate

Assumption: 12 featured entries (avg ~5,000 chars) + 91 indexed (avg ~180 chars).

| Block | Chars | ~Tokens | vs today |
|---|---:|---:|---|
| Featured | ~60,000 | ~17,100 | — |
| Index | ~16,400 | ~4,700 | — |
| Lookup tool schema | ~700 | ~200 | — |
| Header addition | ~280 | ~80 | uncached |
| **New `# Code` total** | **~76,400** | **~21,800** | **-17.2k tokens (-44%)** |

Whole system prompt drops from ~43k → ~22k tokens. Same proportional saving on cold-cache cost (every first turn of every new conversation).

When the agent fetches a lookup mid-answer, those tokens come back into context for that turn only — they are not cached. Worst case per answer: 5 entries × ~5k chars = ~7k tokens added once, not on every turn.

## YAGNI — explicitly out of scope

- No body excerpt in the index. Would push it back toward 40k and defeat the optimization.
- No semantic search / embeddings for "find me the right repo." The agent picks by name/description/tags. Embeddings are a real upgrade, unnecessary for ~100 entries.
- No per-repo TTL or revalidation. KB is build-time; process-lifetime in-memory cache is sufficient (same as today).
- The 5-path cap is hardcoded, not configurable. Revisit if telemetry shows the model bumping against it.
- No change to `# Experience`, which stays fully inlined. At ~12.7k chars / ~3.6k tokens it's the spine of every answer.
- No French/English divergence in featured list. The featured slugs are language-agnostic; each language ships its own translated body.

## Open questions for implementation

None blocking. The featured slug list itself (which ~12 repos) is a curation decision Alexandre owns and can fill in during or after implementation; the code path works with any size list (including 0).

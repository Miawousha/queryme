# Featured kb/code + on-demand lookup tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the chat agent's cached system prompt from ~43k tokens to ~22k tokens by inlining only a hand-curated set of `kb/code` repos and exposing the rest through a `lookup_code_entries` tool the agent calls on demand.

**Architecture:** A new `chat.featured_code` block in `cv-config.yaml` lists the repos to inline. The assembler renders featured entries fully (today's format) under `# Code (featured)` and the rest as one-line stubs under `# Code (index)`. A new tool, wired into `app/api/chat/route.ts`, lets the agent fetch full bodies for indexed repos at answer time. When `chat.featured_code` is absent, behaviour matches today's: every repo inlined under a single `# Code` heading.

**Tech Stack:** TypeScript, Next.js, Vercel AI SDK (`ai` package), Zod, vitest. Existing modules: `lib/kb/assembler.ts`, `lib/kb/cache.ts`, `lib/kb/cv-config.ts`, `lib/kb/loader.ts`, `app/api/chat/route.ts`. Spec: [docs/superpowers/specs/2026-05-27-kb-code-featured-and-lookup-design.md](../specs/2026-05-27-kb-code-featured-and-lookup-design.md).

---

## File map

**Modify:**
- `lib/kb/cv-config.ts` — extend `CvConfigSchema` with optional `chat.featured_code: string[]`; export a helper that returns featured slugs from a config.
- `lib/kb/assembler.ts` — split `renderRepos` into `renderFeaturedRepos` (today's full-body format) and `renderIndexedRepos` (one-line stubs); change `assemblePublicKbText(kb)` to `assemblePublicKbText(kb, options?)` accepting `featuredCodeSlugs?: string[]`.
- `lib/kb/cache.ts` — add `getCachedKb(lang)` exposing the parsed `Kb`; have `getCachedPublicKbText(lang)` read `cv-config.yaml` once and pass `featuredCodeSlugs` into the assembler.
- `app/api/chat/route.ts` — load parsed KB alongside text, build `kbLookup` tools, merge into the `tools` object passed to `answer()`.
- `prompts/system.md` — append one paragraph under "Grounding policy" explaining when to call `lookup_code_entries`.
- `tests/fixtures/kb/code/queryme.md` — keep as-is.
- `tests/lib/kb/assembler.test.ts` — extend with featured/index split tests (using new fixture below).

**Create:**
- `lib/kb/tools.ts` — new module exporting `buildKbLookupTools(kb: Kb): ToolSet`.
- `tests/fixtures/kb/code/sample-indexed.md` — second code fixture entry, used by the assembler tests to exercise the featured-vs-indexed split.
- `tests/lib/kb/tools.test.ts` — tests for `buildKbLookupTools`.
- `tests/lib/kb/cv-config.test.ts` — tests for the extended `loadCvConfig` (chat block parsing).

**Not changing:**
- `lib/answerer.ts` — already accepts a `ToolSet`; the new tools merge in upstream.
- `lib/kb/loader.ts`, `lib/kb/schemas.ts` — no changes needed.

---

## Task 1: Extend `cv-config.ts` with the `chat.featured_code` block

**Files:**
- Modify: `lib/kb/cv-config.ts`
- Create: `tests/lib/kb/cv-config.test.ts`

- [ ] **Step 1.1: Write the failing test for the chat block**

Create `tests/lib/kb/cv-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadCvConfig, getFeaturedCodeSlugs } from "@/lib/kb/cv-config";

async function withTmpDir<T>(yaml: string | null, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-config-test-"));
  try {
    if (yaml !== null) await fs.writeFile(path.join(dir, "cv-config.yaml"), yaml, "utf8");
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("loadCvConfig — chat block", () => {
  it("parses chat.featured_code as a list of slugs", async () => {
    await withTmpDir(
      `chat:\n  featured_code:\n    - repo-a\n    - repo-b\n`,
      async (dir) => {
        const cfg = await loadCvConfig(dir);
        expect(cfg?.chat?.featured_code).toEqual(["repo-a", "repo-b"]);
      },
    );
  });

  it("accepts a config with no chat block (back-compat)", async () => {
    await withTmpDir(`experience:\n  all: true\n`, async (dir) => {
      const cfg = await loadCvConfig(dir);
      expect(cfg?.chat).toBeUndefined();
    });
  });
});

describe("getFeaturedCodeSlugs", () => {
  it("returns the list when set", () => {
    expect(getFeaturedCodeSlugs({ chat: { featured_code: ["a", "b"] } })).toEqual(["a", "b"]);
  });

  it("returns null when the chat block is missing", () => {
    expect(getFeaturedCodeSlugs({})).toBeNull();
  });

  it("returns null when featured_code is missing", () => {
    expect(getFeaturedCodeSlugs({ chat: {} })).toBeNull();
  });

  it("returns null when the config itself is null", () => {
    expect(getFeaturedCodeSlugs(null)).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run the test, confirm it fails**

Run: `pnpm test tests/lib/kb/cv-config.test.ts`

Expected: FAIL — `getFeaturedCodeSlugs` not exported, schema doesn't accept `chat`.

- [ ] **Step 1.3: Extend the schema and add the helper**

Modify `lib/kb/cv-config.ts`. Add the chat sub-schema to `CvConfigSchema` and append the helper at the end of the file:

```ts
// Inside CvConfigSchema definition, add a new optional key:
const ChatBlockSchema = z
  .object({
    featured_code: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .optional();

const CvConfigSchema = z
  .object({
    experience: SectionFilterSchema,
    education: SectionFilterSchema,
    skills: SectionFilterSchema,
    projects: SectionFilterSchema,
    talks: SectionFilterSchema,
    code: SectionFilterSchema,
    chat: ChatBlockSchema,
  })
  .strict();
```

And add this exported helper at the bottom of the file:

```ts
/**
 * Returns the curated list of code slugs to inline in the chat agent's system
 * prompt, or `null` when no curation is configured (the assembler then ships
 * every code entry — today's default behaviour).
 */
export function getFeaturedCodeSlugs(config: CvConfig | null): string[] | null {
  const slugs = config?.chat?.featured_code;
  if (!slugs || slugs.length === 0) return null;
  return slugs;
}
```

- [ ] **Step 1.4: Run the test, confirm it passes**

Run: `pnpm test tests/lib/kb/cv-config.test.ts`

Expected: PASS — all 6 tests green.

- [ ] **Step 1.5: Verify the broader test suite is still green**

Run: `pnpm test tests/lib/kb`

Expected: PASS — existing KB tests unaffected.

- [ ] **Step 1.6: Commit**

```bash
git add lib/kb/cv-config.ts tests/lib/kb/cv-config.test.ts
git commit -m "feat(kb): add chat.featured_code block to cv-config

Lets the chat agent inline only a curated set of code entries; absent
block keeps today's behaviour of inlining everything."
```

---

## Task 2: Assembler — split featured vs indexed rendering

**Files:**
- Modify: `lib/kb/assembler.ts`
- Create: `tests/fixtures/kb/code/sample-indexed.md`
- Modify: `tests/lib/kb/assembler.test.ts`

- [ ] **Step 2.1: Add a second code fixture entry**

Create `tests/fixtures/kb/code/sample-indexed.md`:

```md
---
name: sample-indexed
url: https://example.com/sample-indexed
role: author
visibility: public
description: A fixture used to test the indexed (non-featured) code rendering.
year: 2024
language: TypeScript
tags: [ai, software]
---

Sample indexed body — this content should NOT appear when the repo is in the index.
```

- [ ] **Step 2.2: Write the failing tests for the split**

Append to `tests/lib/kb/assembler.test.ts`:

```ts
describe("assemblePublicKbText — code featured/indexed split", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("with no featured list, renders one `# Code` section with all bodies (back-compat)", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Code");
    expect(text).not.toContain("# Code (featured)");
    expect(text).not.toContain("# Code (index)");
    // Both bodies present.
    expect(text).toContain("Project body — what it is and contributors.");
    expect(text).toContain("Sample indexed body");
  });

  it("with a featured list, renders featured entries fully and indexed entries as stubs", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme"] });
    expect(text).toContain("# Code (featured)");
    expect(text).toContain("## queryme");
    expect(text).toContain("Project body — what it is and contributors.");
    expect(text).toContain("# Code (index)");
    // Stub for the indexed entry.
    expect(text).toMatch(/^- sample-indexed — A fixture used to test/m);
    expect(text).toContain("tags: [ai, software]");
    expect(text).toContain("language: TypeScript");
    expect(text).toContain("year: 2024");
    expect(text).toContain("[ref: code/sample-indexed.md]");
    // Indexed body must NOT be in the prompt.
    expect(text).not.toContain("Sample indexed body");
  });

  it("appends a usage hint after the index section telling the agent to call lookup_code_entries", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme"] });
    expect(text).toContain("lookup_code_entries");
  });

  it("unknown featured slugs are silently skipped (no throw)", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["does-not-exist", "queryme"] });
    expect(text).toContain("## queryme");
    expect(text).toContain("# Code (index)");
  });

  it("when every code entry is featured, no index section is emitted", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: ["queryme", "sample-indexed"] });
    expect(text).toContain("# Code (featured)");
    expect(text).not.toContain("# Code (index)");
  });

  it("when featured list is empty, all entries land in the index (no featured section)", () => {
    const text = assemblePublicKbText(kb, { featuredCodeSlugs: [] });
    // Empty array means "no featured" — assembler should fall back to today's
    // behaviour (single `# Code` section with full bodies). This matches
    // getFeaturedCodeSlugs returning null for an empty list.
    expect(text).toContain("# Code");
    expect(text).not.toContain("# Code (index)");
  });
});
```

Note about the last test: empty array should behave like `null` (today's behaviour). This matches `getFeaturedCodeSlugs` from Task 1. The assembler should normalize at its boundary.

- [ ] **Step 2.3: Run the tests, confirm they fail**

Run: `pnpm test tests/lib/kb/assembler.test.ts`

Expected: most existing tests still pass; new split tests FAIL (function signature, sections missing).

- [ ] **Step 2.4: Implement the split**

Replace `renderRepos` and update `assemblePublicKbText` in `lib/kb/assembler.ts`:

```ts
export type AssembleOptions = {
  /**
   * Slugs to inline as full entries under `# Code (featured)`. Remaining code
   * entries render as one-line stubs under `# Code (index)`.
   *
   * `undefined` or empty array → today's behaviour: single `# Code` section
   * with full bodies for all entries.
   */
  featuredCodeSlugs?: string[];
};

export function assemblePublicKbText(kb: Kb, options: AssembleOptions = {}): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));
  if (kb.talks.length) sections.push(renderTalks(kb));
  if (kb.code.length) {
    const featured = (options.featuredCodeSlugs ?? []).length > 0 ? options.featuredCodeSlugs! : null;
    if (featured === null) {
      sections.push(renderRepos(kb.code, "# Code"));
    } else {
      const featuredSet = new Set(featured);
      const featuredEntries = featured
        .map((slug) => kb.code.find((r) => r.slug === slug))
        .filter((r): r is typeof kb.code[number] => r !== undefined);
      const indexedEntries = kb.code.filter((r) => !featuredSet.has(r.slug));

      if (featuredEntries.length) sections.push(renderRepos(featuredEntries, "# Code (featured)"));
      if (indexedEntries.length) sections.push(renderIndexedRepos(indexedEntries));
    }
  }
  if (kb.recommendations.length) sections.push(renderRecommendations(kb));

  return sections.join("\n\n");
}

// Replace the existing renderRepos signature:
function renderRepos(entries: Kb["code"], heading: string): string {
  const lines = [heading, ``];
  for (const p of entries) {
    lines.push(`## ${p.frontmatter.name}`);
    lines.push(`[ref: ${p.relativePath}]`);
    lines.push(`Role: ${p.frontmatter.role}`);
    lines.push(`Visibility: ${p.frontmatter.visibility}`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.language) lines.push(`Language: ${p.frontmatter.language}`);
    if (p.frontmatter.year !== undefined) lines.push(`Year: ${p.frontmatter.year}`);
    if (p.frontmatter.last_active) lines.push(`Last active: ${p.frontmatter.last_active}`);
    if (p.frontmatter.code_bytes !== undefined) lines.push(`Code size: ${p.frontmatter.code_bytes} bytes`);
    if (p.frontmatter.stars !== undefined) lines.push(`Stars: ${p.frontmatter.stars}`);
    if (p.frontmatter.archived) lines.push(`Archived: yes`);
    if (p.frontmatter.description) lines.push(`Description: ${p.frontmatter.description}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``, p.body, ``);
  }
  return lines.join("\n");
}

// New: one-line stub per non-featured entry plus a usage hint.
function renderIndexedRepos(entries: Kb["code"]): string {
  const lines = ["# Code (index)", ""];
  for (const p of entries) {
    const desc = p.frontmatter.description ?? "(no description)";
    lines.push(`- ${p.frontmatter.name} — ${desc}`);
    const meta: string[] = [];
    if (p.frontmatter.tags?.length) meta.push(`tags: [${p.frontmatter.tags.join(", ")}]`);
    if (p.frontmatter.language) meta.push(`language: ${p.frontmatter.language}`);
    if (p.frontmatter.year !== undefined) meta.push(`year: ${p.frontmatter.year}`);
    if (meta.length) lines.push(`  ${meta.join(", ")}`);
    lines.push(`  [ref: ${p.relativePath}]`);
  }
  lines.push(
    "",
    "These additional repos are not pre-loaded. Call `lookup_code_entries`",
    "with up to 5 of the `[ref: code/<slug>.md]` paths above to fetch their",
    "full bodies before answering questions about them.",
  );
  return lines.join("\n");
}
```

Also update the call sites: `renderRepos(kb)` becomes `renderRepos(kb.code, "# Code")`.

- [ ] **Step 2.5: Run the assembler tests, confirm they pass**

Run: `pnpm test tests/lib/kb/assembler.test.ts`

Expected: PASS — all existing + new tests green.

- [ ] **Step 2.6: Run the full KB test suite**

Run: `pnpm test tests/lib/kb`

Expected: PASS.

- [ ] **Step 2.7: Commit**

```bash
git add lib/kb/assembler.ts tests/lib/kb/assembler.test.ts tests/fixtures/kb/code/sample-indexed.md
git commit -m "feat(kb): split code section into featured/index in assembler

When featuredCodeSlugs is supplied, full bodies render under
'# Code (featured)' and remaining entries render as one-line stubs
under '# Code (index)' with a usage hint pointing at lookup_code_entries.
No-arg call preserves today's single-section behaviour."
```

---

## Task 3: Cache layer — expose parsed `Kb` and wire `cv-config` into assembly

**Files:**
- Modify: `lib/kb/cache.ts`

- [ ] **Step 3.1: Update the cache module**

Replace `lib/kb/cache.ts` with:

```ts
import path from "node:path";
import { loadKb, type Kb, type KbLang } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { loadCvConfig, getFeaturedCodeSlugs, type CvConfig } from "@/lib/kb/cv-config";

/**
 * Process-lifetime caches for the knowledge base. The KB ships with the build
 * and never changes at runtime, so the parsed Kb, the assembled public text,
 * the file manifest, and the cv-config are all loaded once and reused.
 */

const KB_DIR = path.resolve(process.cwd(), "kb");
const CONFIG_DIR = process.cwd();

const parsedKbByLang = new Map<KbLang, Kb>();
const publicKbTextByLang = new Map<KbLang, string>();

let cvConfigPromise: Promise<CvConfig | null> | null = null;

function getCvConfig(): Promise<CvConfig | null> {
  if (cvConfigPromise === null) cvConfigPromise = loadCvConfig(CONFIG_DIR);
  return cvConfigPromise;
}

/** The parsed KB graph. Used both by the assembler and by lookup tools. */
export async function getCachedKb(lang: KbLang = "en"): Promise<Kb> {
  const cached = parsedKbByLang.get(lang);
  if (cached !== undefined) return cached;
  const kb = await loadKb(KB_DIR, lang);
  parsedKbByLang.set(lang, kb);
  return kb;
}

/** The assembled public KB text given to the chat / MCP agent. */
export async function getCachedPublicKbText(lang: KbLang = "en"): Promise<string> {
  const cached = publicKbTextByLang.get(lang);
  if (cached !== undefined) return cached;
  const [kb, config] = await Promise.all([getCachedKb(lang), getCvConfig()]);
  const featuredCodeSlugs = getFeaturedCodeSlugs(config) ?? undefined;
  const text = assemblePublicKbText(kb, { featuredCodeSlugs });
  publicKbTextByLang.set(lang, text);
  return text;
}

let manifest: KbFile[] | null = null;

/** The public KB file manifest served by the `/api/kb` routes. */
export async function getCachedKbManifest(): Promise<KbFile[]> {
  if (manifest === null) {
    manifest = await loadKbManifest(KB_DIR);
  }
  return manifest;
}
```

- [ ] **Step 3.2: Type-check**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3.3: Run the KB tests**

Run: `pnpm test tests/lib/kb`

Expected: PASS — cache layer has no dedicated tests today; behaviour is exercised via callers.

- [ ] **Step 3.4: Commit**

```bash
git add lib/kb/cache.ts
git commit -m "feat(kb): cache parsed Kb and apply chat.featured_code in assembly

getCachedKb exposes the parsed graph for the lookup tool; the public-text
assembler now consults cv-config.yaml's chat.featured_code (when present)
to decide which entries to inline."
```

---

## Task 4: Lookup tool — `lib/kb/tools.ts`

**Files:**
- Create: `lib/kb/tools.ts`
- Create: `tests/lib/kb/tools.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/lib/kb/tools.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { buildKbLookupTools } from "@/lib/kb/tools";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

async function callLookup(kb: Kb, paths: string[]) {
  const tools = buildKbLookupTools(kb);
  const tool = tools.lookup_code_entries;
  if (!tool || typeof tool.execute !== "function") throw new Error("tool missing");
  return tool.execute({ paths }, { toolCallId: "t1", messages: [] });
}

describe("buildKbLookupTools — lookup_code_entries", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("returns the body and frontmatter for a known path", async () => {
    const res = await callLookup(kb, ["code/queryme.md"]);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].path).toBe("code/queryme.md");
    expect(res.entries[0].name).toBe("queryme");
    expect(res.entries[0].body).toContain("Project body — what it is and contributors.");
    expect(res.entries[0].frontmatter).toMatchObject({ name: "queryme", role: "author" });
    expect(res.notFound).toEqual([]);
  });

  it("returns multiple entries in input order", async () => {
    const res = await callLookup(kb, ["code/sample-indexed.md", "code/queryme.md"]);
    expect(res.entries.map((e) => e.path)).toEqual(["code/sample-indexed.md", "code/queryme.md"]);
  });

  it("reports unknown but well-formed paths in notFound", async () => {
    const res = await callLookup(kb, ["code/does-not-exist.md", "code/queryme.md"]);
    expect(res.entries.map((e) => e.path)).toEqual(["code/queryme.md"]);
    expect(res.notFound).toEqual(["code/does-not-exist.md"]);
  });

  it("rejects path traversal attempts in notFound", async () => {
    const res = await callLookup(kb, ["code/../sensitive/foo.md"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["code/../sensitive/foo.md"]);
  });

  it("rejects paths outside the code/ prefix in notFound", async () => {
    const res = await callLookup(kb, ["experience/foo.md", "anything.md"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["experience/foo.md", "anything.md"]);
  });

  it("rejects paths without the .md suffix in notFound", async () => {
    const res = await callLookup(kb, ["code/queryme"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["code/queryme"]);
  });

  it("Zod rejects more than 5 paths via inputSchema", async () => {
    const tools = buildKbLookupTools(kb);
    const tool = tools.lookup_code_entries!;
    const six = ["code/a.md","code/b.md","code/c.md","code/d.md","code/e.md","code/f.md"];
    const parsed = tool.inputSchema.safeParse({ paths: six });
    expect(parsed.success).toBe(false);
  });

  it("Zod rejects empty paths array via inputSchema", async () => {
    const tools = buildKbLookupTools(kb);
    const tool = tools.lookup_code_entries!;
    const parsed = tool.inputSchema.safeParse({ paths: [] });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run the tests, confirm they fail**

Run: `pnpm test tests/lib/kb/tools.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 4.3: Implement the tool**

Create `lib/kb/tools.ts`:

```ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Kb, RepoEntry } from "@/lib/kb/loader";

const PATH_RE = /^code\/[a-zA-Z0-9_-]+\.md$/;

const InputSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(5),
});

type LookupEntry = {
  path: string;
  name: string;
  body: string;
  frontmatter: RepoEntry["frontmatter"];
};

/**
 * Build the `lookup_code_entries` tool, closed over an in-memory map of code
 * entries by their canonical `[ref: code/<slug>.md]` path. The map is built
 * once per call to this factory — callers are expected to hand in the cached
 * Kb so this is effectively free.
 *
 * Path validation, unknown-slug handling, and over-cap inputs all return
 * structured responses to the model instead of throwing — a tool error would
 * abort the answer stream, and the model can recover from a structured
 * "notFound" list (apologize, or try a different path).
 */
export function buildKbLookupTools(kb: Kb): ToolSet {
  const byPath = new Map<string, RepoEntry>();
  for (const repo of kb.code) byPath.set(repo.relativePath, repo);

  return {
    lookup_code_entries: tool({
      description:
        "Fetch full bodies and metadata for code entries listed in the " +
        "'# Code (index)' section. Pass up to 5 ref paths (each like " +
        "'code/<slug>.md', matching the [ref: ...] markers in the index). " +
        "Returns each entry's body plus all frontmatter. Unknown paths land " +
        "in `notFound`; the request itself does not fail.",
      inputSchema: InputSchema,
      execute: async ({ paths }) => {
        const entries: LookupEntry[] = [];
        const notFound: string[] = [];
        for (const p of paths) {
          if (!PATH_RE.test(p)) {
            notFound.push(p);
            continue;
          }
          const hit = byPath.get(p);
          if (!hit) {
            notFound.push(p);
            continue;
          }
          entries.push({
            path: hit.relativePath,
            name: hit.frontmatter.name,
            body: hit.body,
            frontmatter: hit.frontmatter,
          });
        }
        return { entries, notFound };
      },
    }),
  };
}
```

- [ ] **Step 4.4: Run the tests, confirm they pass**

Run: `pnpm test tests/lib/kb/tools.test.ts`

Expected: PASS — all 8 tests green.

- [ ] **Step 4.5: Type-check**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add lib/kb/tools.ts tests/lib/kb/tools.test.ts
git commit -m "feat(kb): add lookup_code_entries tool for on-demand body fetch

Tool returns body + frontmatter for up to 5 ref paths per call, capped
via Zod. Path-validation and unknown-slug failures land in notFound[]
so the answer stream never aborts."
```

---

## Task 5: Wire the lookup tool into `/api/chat`

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 5.1: Update the route**

In `app/api/chat/route.ts`, replace the section that loads the KB and calls `answer(...)`:

Replace:
```ts
const publicKbText = await getCachedPublicKbText(lang);
```
with:
```ts
const [publicKbText, parsedKb] = await Promise.all([
  getCachedPublicKbText(lang),
  getCachedKb(lang),
]);
```

Add the import at the top:
```ts
import { getCachedKb, getCachedPublicKbText } from "@/lib/kb/cache";
import { buildKbLookupTools } from "@/lib/kb/tools";
```
(replacing the existing single-import line for `getCachedPublicKbText`.)

Replace the `answer({...})` call:
```ts
const result = await answer({
  messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
  kbText: publicKbText,
  tools: buildIdentifyTools((identity) => setInterviewer(db, conversationId, identity)),
});
```
with:
```ts
const result = await answer({
  messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
  kbText: publicKbText,
  tools: {
    ...buildIdentifyTools((identity) => setInterviewer(db, conversationId, identity)),
    ...buildKbLookupTools(parsedKb),
  },
});
```

- [ ] **Step 5.2: Type-check**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5.3: Run the test suite for chat and KB**

Run: `pnpm test tests/lib`

Expected: PASS — no chat-route unit tests today; answerer + KB tests still green.

- [ ] **Step 5.4: Smoke test with the dev server (manual)**

Run: `pnpm dev`

In another shell, POST a chat request that mentions a non-featured repo by description (use whatever slug isn't featured once Task 7 sets the list — for this smoke test, you can leave `chat.featured_code` unset and verify the route still works in the back-compat path).

```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"Tell me about queryme."}]}]}'
```

Expected: 200 with a streamed answer. No 500s in the dev-server logs.

- [ ] **Step 5.5: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): wire lookup_code_entries tool into /api/chat

Loads the parsed KB alongside the assembled text and merges the kb
lookup tool into the existing identify_interviewer tool set."
```

---

## Task 6: Update the system prompt header

**Files:**
- Modify: `prompts/system.md`
- Verify: `tests/prompts/system-contract.test.ts`

- [ ] **Step 6.1: Read the current header**

Run: `cat prompts/system.md`

Expected: confirm the "Grounding policy" section exists (it does, lines 10-13 in the current file).

- [ ] **Step 6.2: Read the contract test**

Run: `cat tests/prompts/system-contract.test.ts`

Note any string assertions that pin specific wording in the Grounding policy section. If a test asserts the exact text of an existing line, plan to keep that line intact and only append.

- [ ] **Step 6.3: Append a paragraph to the Grounding policy section**

After the existing "Never invent specific facts: ..." bullet (line 13), append a new paragraph:

```md
- When the prompt contains a `# Code (index)` section, those repos are
  *not* pre-loaded. Call the `lookup_code_entries` tool with up to 5 of
  the `[ref: code/<slug>.md]` paths listed in the index to fetch full
  bodies before answering questions about those repos. Prefer the
  featured entries when the question is general; use lookup when the
  question names a specific project, language, or tag that isn't
  covered by the featured set.
```

- [ ] **Step 6.4: Run the contract test**

Run: `pnpm test tests/prompts/system-contract.test.ts`

Expected: PASS. If a test pins the file's length or hash, update the test to reflect the new content — but only the additions; do NOT remove existing assertions about voice, language policy, or grounding.

- [ ] **Step 6.5: Commit**

```bash
git add prompts/system.md
# Also include any test update if step 6.4 required one
git commit -m "feat(prompts): tell the agent how to use the kb index + lookup tool

Adds one paragraph under Grounding policy. Featured entries remain the
default; lookup is for specific named projects in the index."
```

---

## Task 7: Curate the featured code list

**Files:**
- Modify: `cv-config.yaml`

- [ ] **Step 7.1: Read the current cv-config**

Run: `cat cv-config.yaml`

- [ ] **Step 7.2: List candidate slugs**

Run: `ls kb/code/ | sed 's/\.md$//' | grep -v '\.fr$' | sort`

This is the universe of slugs Alexandre will pick from.

- [ ] **Step 7.3: Add the chat block with ~12 featured slugs**

Append to `cv-config.yaml` (replace the example slugs with Alexandre's actual picks — this is a curation decision he owns; if working solo, default to the 10-15 repos he'd most want on a recruiter's screen for technical depth):

```yaml
chat:
  featured_code:
    - <slug-1>
    - <slug-2>
    # ... 10-15 entries total, ordered by importance
```

If Alexandre hasn't yet decided the list, leave the block out and the system falls back to today's behaviour (everything inlined). The optimization activates the moment the block is added.

- [ ] **Step 7.4: Validate the config loads**

Run: `pnpm validate:kb`

(Per `package.json:build`, this is the script that gates the build. If it doesn't catch cv-config errors today, run instead:)

Run: `pnpm tsx -e "import('./lib/kb/cv-config.ts').then(m => m.loadCvConfig('.').then(c => console.log(JSON.stringify(c.chat, null, 2))))"`

Expected: prints the parsed `chat` block; no schema errors.

- [ ] **Step 7.5: Measure the token impact**

Run from the repo root:

```bash
pnpm tsx -e "
import { getCachedPublicKbText } from './lib/kb/cache.ts';
(async () => {
  const t = await getCachedPublicKbText('en');
  console.log('chars:', t.length, '~tokens:', Math.round(t.length/3.5));
  const codeSection = t.split('# Code')[1] ?? '';
  console.log('# Code* chars:', codeSection.length);
})();
"
```

Expected: total chars drop substantially vs the pre-change baseline of 151,771. `# Code` portion should be in the 70-80k range with 12 featured entries.

- [ ] **Step 7.6: Commit**

```bash
git add cv-config.yaml
git commit -m "feat(kb): curate featured code list for chat agent

Reduces the cached system prompt by inlining only the repos that best
demonstrate technical range; everything else is reachable via
lookup_code_entries."
```

---

## Task 8: End-to-end verification

**Files:** none modified.

- [ ] **Step 8.1: Run the full test suite**

Run: `pnpm test`

Expected: PASS — every existing and new test green.

- [ ] **Step 8.2: Type-check**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 8.3: Build**

Run: `pnpm build`

Expected: PASS — `validate:kb` runs first, then `next build`.

- [ ] **Step 8.4: Spin up dev and exercise both paths**

Run: `pnpm dev`

In another shell:

```bash
# Featured-repo question — agent should answer without tool calls
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"What is queryme?"}]}]}' \
  | head -50

# Indexed-repo question — agent should call lookup_code_entries first
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"Tell me about <a-slug-that-was-NOT-featured>"}]}]}' \
  | head -100
```

Expected: both stream answers; the second one shows tool-call activity in the dev-server logs (the AI SDK logs tool calls at info level).

- [ ] **Step 8.5: Final commit if anything was tweaked**

If steps 8.1-8.4 turned up nothing to change, no commit is needed. Otherwise:

```bash
git add -A
git commit -m "fix: ..."
```

---

## Out of scope (deferred — do NOT implement here)

These were called out in the spec as YAGNI:

- No body excerpt in the index (defeats the optimization).
- No semantic search / embeddings for repo selection — agent picks by name/description/tags.
- No per-repo TTL or revalidation — KB is build-time.
- No configurable cap — hardcoded 5.
- No change to `# Experience` (stays fully inlined).
- No French/English divergence in featured list (same slugs both languages; bodies are already per-language via the loader's locale sidecars).

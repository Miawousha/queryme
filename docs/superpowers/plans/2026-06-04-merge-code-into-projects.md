# Merge `code` into `projects` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the KB's `code` category into `projects` — a project's front-matter gains an optional `repos:` array (metadata + one-line description), and the standalone `kb/code/` folder, its tag registry, the featured/index split, and the `lookup_code_entries` tool are removed.

**Architecture:** `RepoSchema` becomes a nested object inside `ProjectFrontmatterSchema.repos`. The loader stops reading `kb/code/` and exposes `allRepos(kb)` (flat-map of every project's repos) for aggregated views. The assembler renders each project's repos beneath it. The chat agent loses its on-demand code tool (everything is inlined under projects). A codemod migrates existing `kb/code/*.md` into project `repos:` arrays, losslessly, after an analysis-driven first-cut grouping reviewed with the user.

**Tech Stack:** TypeScript, Zod, Next.js (App Router), Vitest, gray-matter, `yaml`, `gh` CLI, tsx.

**Spec:** [docs/superpowers/specs/2026-06-04-merge-code-into-projects-design.md](../specs/2026-06-04-merge-code-into-projects-design.md)

**Tooling note:** This repo has no `lint` script. The quality gates are `pnpm typecheck` (`tsc --noEmit`) and `pnpm build` (`next build`, which also runs ESLint). Use those — there is no `pnpm lint`.

**Note on the red window:** This is a cross-cutting refactor around `kb.code`. Each task runs its own focused tests; a full `pnpm test && pnpm typecheck` only goes green after Task 11. Tasks are ordered to land the data-layer change first, then update every consumer, then the final full-suite gate (Task 16). Do not be alarmed by repo-wide `tsc` errors between Task 2 and Task 11 — Task 16 is the gate.

**Historical docs are out of scope:** Do NOT edit files under `docs/superpowers/plans/` or `docs/superpowers/specs/` other than this plan and its spec — they are records of past work.

---

### Task 0: Feature branch

**Files:** none (git only)

- [ ] **Step 1: Create the branch**

Run:
```bash
git checkout -b feat/merge-code-into-projects
```
Expected: `Switched to a new branch 'feat/merge-code-into-projects'`

---

### Task 1: Nested `RepoSchema` + `project.repos` (schema)

**Files:**
- Modify: `lib/kb/schemas.ts:76-116`
- Test: `tests/lib/kb/schemas.test.ts`

- [ ] **Step 1: Rewrite the schema tests for the nested shape**

In `tests/lib/kb/schemas.test.ts`, change the import on line 10 from `RepoFrontmatterSchema` to `RepoSchema`:

```ts
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RepoSchema,
  RecommendationFrontmatterSchema,
} from "@/lib/kb/schemas";
```

Replace the whole `describe("ProjectFrontmatterSchema", ...)` block with:

```ts
describe("ProjectFrontmatterSchema", () => {
  it("accepts a typical project entry", () => {
    const data = {
      name: "Queryme",
      year: 2026,
      stack: ["TypeScript"],
      tags: ["ai"],
      url: "https://github.com/x/queryme",
    };
    expect(ProjectFrontmatterSchema.parse(data)).toEqual(data);
  });

  it("accepts a project with a nested repos array", () => {
    const data = {
      name: "Queryme",
      repos: [
        { name: "queryme", role: "author", url: "https://github.com/x/queryme" },
      ],
    };
    const parsed = ProjectFrontmatterSchema.parse(data);
    expect(parsed.repos).toHaveLength(1);
    expect(parsed.repos![0].visibility).toBe("public"); // default applied
  });
});
```

Replace the whole `describe("RepoFrontmatterSchema", ...)` block with the same cases renamed to `RepoSchema`:

```ts
describe("RepoSchema", () => {
  it("accepts a minimal public repo (visibility defaults to public)", () => {
    const parsed = RepoSchema.parse({
      name: "queryme",
      url: "https://github.com/Miawousha/queryme",
      role: "author",
    });
    expect(parsed.visibility).toBe("public");
  });

  it("accepts a private repo without a url", () => {
    expect(() =>
      RepoSchema.parse({ name: "internal-tool", role: "author", visibility: "private" }),
    ).not.toThrow();
  });

  it("accepts optional language/stars/archived/last_active/stack/tags fields", () => {
    const parsed = RepoSchema.parse({
      name: "x",
      url: "https://example.com/x",
      role: "author",
      language: "TypeScript",
      stars: 42,
      archived: true,
      last_active: "2025-05",
      stack: ["Rust"],
      tags: ["tooling"],
    });
    expect(parsed.language).toBe("TypeScript");
    expect(parsed.stars).toBe(42);
    expect(parsed.archived).toBe(true);
    expect(parsed.last_active).toBe("2025-05");
  });

  it("rejects an invalid role", () => {
    expect(() => RepoSchema.parse({ name: "x", url: "https://example.com/x", role: "owner" })).toThrow();
  });

  it("rejects an invalid visibility", () => {
    expect(() => RepoSchema.parse({ name: "x", role: "author", visibility: "secret" })).toThrow();
  });

  it("rejects negative stars", () => {
    expect(() =>
      RepoSchema.parse({ name: "x", url: "https://example.com/x", role: "author", stars: -1 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the schema tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/schemas.test.ts`
Expected: FAIL — `RepoSchema` is not exported from `@/lib/kb/schemas`.

- [ ] **Step 3: Update `lib/kb/schemas.ts`**

Replace lines 76-116 (the `ProjectFrontmatterSchema` block through the `RepoFrontmatter` type export) with:

```ts
export const RepoSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["author", "maintainer", "contributor"]),
  url: z.url().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  /** One-line subtitle for the panel + CV. The project body holds the narrative. */
  description: z.string().optional(),
  language: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  /** YYYY-MM of last activity. */
  last_active: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stars: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  stack: z.array(z.string()).optional(),
  /** Free-form; no registry validation. */
  tags: z.array(z.string()).optional(),
});
export type Repo = z.infer<typeof RepoSchema>;

export const ProjectFrontmatterSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  url: z.url().optional(),
  /** Repos hosted under this project (replaces the old top-level `code/` category). */
  repos: z.array(RepoSchema).optional(),
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;

export const TalkFrontmatterSchema = z.object({
  title: z.string().min(1),
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  location: z.string().optional(),
  url: z.url().optional(),
  tags: z.array(z.string()).optional(),
});
export type TalkFrontmatter = z.infer<typeof TalkFrontmatterSchema>;
```

Note: this deletes the old `TalkFrontmatterSchema` (lines 85-93) — it is reproduced above unchanged so the block is contiguous. Confirm the file now has exactly one `TalkFrontmatterSchema`, one `ProjectFrontmatterSchema`, `RepoSchema`, and `Repo`, and NO `RepoFrontmatterSchema` / `RepoFrontmatter` / `code_bytes`.

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `pnpm vitest run tests/lib/kb/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/schemas.ts tests/lib/kb/schemas.test.ts
git commit -m "feat(kb): nest RepoSchema under project.repos; drop code_bytes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Loader — stop reading `kb/code/`, add `allRepos` (+ migrate the test fixture)

**Files:**
- Modify: `lib/kb/loader.ts`
- Modify: `tests/fixtures/kb/projects/fixture-project.md`
- Delete: `tests/fixtures/kb/code/queryme.md`, `tests/fixtures/kb/code/sample-indexed.md`
- Test: `tests/lib/kb/loader.test.ts`

- [ ] **Step 1: Migrate the fixture — fold the two code entries into the project**

Overwrite `tests/fixtures/kb/projects/fixture-project.md` with:

```markdown
---
name: Fixture Project
year: 2025
stack: [TypeScript]
tags: [test]
url: https://example.com
repos:
  - name: queryme
    url: https://github.com/Miawousha/queryme
    role: author
    visibility: public
    description: An agent-driven CV.
    year: 2026
    tags: [ai, software]
  - name: sample-indexed
    url: https://example.com/sample-indexed
    role: author
    visibility: public
    description: A fixture used to test repo rendering.
    year: 2024
    language: TypeScript
    tags: [ai, software]
---

## Summary
A fixture project body.
```

Delete the old code fixtures:
```bash
git rm tests/fixtures/kb/code/queryme.md tests/fixtures/kb/code/sample-indexed.md
```

- [ ] **Step 2: Rewrite the loader test**

In `tests/lib/kb/loader.test.ts`:

Replace the project assertions inside the first test (lines 25-29) with:
```ts
    expect(kb.projects).toHaveLength(1);
    expect(kb.projects[0].slug).toBe("fixture-project");
    expect(kb.projects[0].frontmatter.name).toBe("Fixture Project");
    expect(kb.projects[0].frontmatter.repos).toHaveLength(2);
    expect(kb.projects[0].frontmatter.repos![0].name).toBe("queryme");
    expect(kb.projects[0].frontmatter.repos![0].visibility).toBe("public");
    expect(kb.projects[0].body).toContain("A fixture project body.");
    expect(kb.projects[0].relativePath).toBe("projects/fixture-project.md");
```

Replace the `it("loads talks, code, and recommendations entries", ...)` test (lines 57-73) with:
```ts
  it("loads talks and recommendations entries", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    expect(kb.talks).toHaveLength(1);
    expect(kb.talks[0].frontmatter.title).toBe("Battery emulation at scale");
    expect(kb.talks[0].relativePath).toBe("talks/2024-evs37.md");

    expect(kb.recommendations).toHaveLength(1);
    expect(kb.recommendations[0].frontmatter.from).toBe("Jane Doe");
    expect(kb.recommendations[0].relativePath).toBe("recommendations/2024-09-jane-doe.md");
  });

  it("allRepos flattens every project's repos, sorted year desc then name", async () => {
    const { allRepos } = await import("@/lib/kb/loader");
    const kb = await loadKb(FIXTURE_DIR);
    const repos = allRepos(kb);
    expect(repos.map((r) => r.name)).toEqual(["queryme", "sample-indexed"]);
  });
```

- [ ] **Step 3: Run the loader test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/loader.test.ts`
Expected: FAIL — `allRepos` not exported / `kb.projects[0].frontmatter.repos` undefined while loader still references `code-index`.

- [ ] **Step 4: Update `lib/kb/loader.ts`**

Edit the schema import block (lines 5-24) to drop `RepoFrontmatterSchema`/`RepoFrontmatter` and add `Repo`:
```ts
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RecommendationFrontmatterSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type Repo,
  type RecommendationFrontmatter,
} from "./schemas";
```

Delete line 25 entirely: `import { loadCodeIndex, resolveRepoTags } from "./code-index";`

Delete the `RepoEntry` type (lines 48-53).

In the `Kb` type, delete line 70: `code: RepoEntry[];`

In `loadKb`, change the destructuring + `Promise.all` (lines 172-188) to:
```ts
  const [
    profile, skills, education, publicContact,
    experience, projects,
    talks, recommendations,
  ] = await Promise.all([
    readYamlFile(await pickFile(path.join(rootDir, "profile"), "yaml", lang), ProfileSchema, "profile.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "skills"), "yaml", lang), SkillsSchema, "skills.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "education"), "yaml", lang), EducationSchema, "education.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "public-contact"), "yaml", lang), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience", lang),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects", lang),
    readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks", lang),
    readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations", lang),
  ]);
```

Delete the entire tag-resolution loop (old lines 190-198, the `for (const repo of code) { ... }` block and its comment).

Delete the code sort (old lines 203-205, `code.sort(...)`).

Remove `code,` from the final `return { ... }` object (old line 215).

Append the `allRepos` helper at the end of the file:
```ts
/** Every repo hosted across all projects, sorted year desc then name. Used by
 * the aggregated "Repositories" view on the CV / KB panel. */
export function allRepos(kb: Kb): Repo[] {
  return kb.projects
    .flatMap((p) => p.frontmatter.repos ?? [])
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Run the loader test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/loader.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/kb/loader.ts tests/lib/kb/loader.test.ts tests/fixtures/kb/
git commit -m "feat(kb): loader reads repos from projects; add allRepos; drop code/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Assembler — render repos under each project

**Files:**
- Modify: `lib/kb/assembler.ts`
- Test: `tests/lib/kb/assembler.test.ts`

- [ ] **Step 1: Rewrite the assembler tests**

In `tests/lib/kb/assembler.test.ts`:

Replace the `it("includes one section per project entry with file ref", ...)` test (lines 37-42) with:
```ts
  it("includes one section per project entry with file ref and its repos", () => {
    const text = assemblePublicKbText(kb);
    expect(text).toContain("# Projects");
    expect(text).toContain("## Fixture Project (2025)");
    expect(text).toContain("[ref: projects/fixture-project.md]");
    expect(text).toContain("### Repositories");
    expect(text).toContain("- queryme — An agent-driven CV.");
    expect(text).toContain("- sample-indexed");
  });
```

Replace the `it("includes a Code section with [ref: code/...] markers", ...)` test (lines 72-77) with:
```ts
  it("no longer emits a top-level Code section", () => {
    const text = assemblePublicKbText(kb);
    expect(text).not.toContain("# Code");
    expect(text).not.toContain("[ref: code/");
  });
```

Delete the entire second describe block `describe("assemblePublicKbText — code featured/indexed split", ...)` (lines 87-145).

- [ ] **Step 2: Run the assembler test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/assembler.test.ts`
Expected: FAIL — `# Code` still emitted; `### Repositories` absent.

- [ ] **Step 3: Update `lib/kb/assembler.ts`**

Replace lines 1-42 (imports, `AssembleOptions`, and `assemblePublicKbText`) with:
```ts
import type { Kb } from "./loader";
import type { Repo } from "./schemas";

export function assemblePublicKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));
  if (kb.talks.length) sections.push(renderTalks(kb));
  if (kb.recommendations.length) sections.push(renderRecommendations(kb));

  return sections.join("\n\n");
}
```

Replace `renderProjects` (lines 108-122) with:
```ts
function renderProjects(kb: Kb): string {
  const lines = [`# Projects`, ``];
  for (const p of kb.projects) {
    const year = p.frontmatter.year ? ` (${p.frontmatter.year})` : "";
    lines.push(`## ${p.frontmatter.name}${year}`);
    lines.push(`[ref: ${p.relativePath}]`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.stack?.length) lines.push(`Stack: ${p.frontmatter.stack.join(", ")}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``);
    lines.push(p.body);
    const repos = p.frontmatter.repos ?? [];
    if (repos.length) {
      lines.push(``, `### Repositories`);
      for (const r of repos) lines.push(renderRepoLine(r));
    }
    lines.push(``);
  }
  return lines.join("\n");
}

function renderRepoLine(r: Repo): string {
  const meta: string[] = [`role: ${r.role}`, `visibility: ${r.visibility}`];
  if (r.url) meta.push(`url: ${r.url}`);
  if (r.language) meta.push(`language: ${r.language}`);
  if (r.year !== undefined) meta.push(`year: ${r.year}`);
  if (r.last_active) meta.push(`last active: ${r.last_active}`);
  if (r.stars !== undefined) meta.push(`stars: ${r.stars}`);
  if (r.archived) meta.push(`archived`);
  if (r.stack?.length) meta.push(`stack: ${r.stack.join(", ")}`);
  if (r.tags?.length) meta.push(`tags: ${r.tags.join(", ")}`);
  const desc = r.description ? ` — ${r.description}` : "";
  return `- ${r.name}${desc} (${meta.join(", ")})`;
}
```

Delete `renderRepos` (lines 138-157) and `renderIndexedRepos` (lines 159-178) entirely.

- [ ] **Step 4: Run the assembler test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/assembler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/assembler.ts tests/lib/kb/assembler.test.ts
git commit -m "feat(kb): assembler renders repos under their project; drop Code sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Delete the `lookup_code_entries` tool + its chat/MCP wiring

**Files:**
- Delete: `lib/kb/tools.ts`, `tests/lib/kb/tools.test.ts`
- Modify: `lib/chat/handle-chat.ts`, `lib/mcp/server.ts`, `components/chat.tsx`

- [ ] **Step 1: Delete the tool and its test**

```bash
git rm lib/kb/tools.ts tests/lib/kb/tools.test.ts
```

- [ ] **Step 2: Update `lib/chat/handle-chat.ts`**

- Line 4: change `import { getCachedKb, getCachedPublicKbText } from "@/lib/kb/cache";` to `import { getCachedPublicKbText } from "@/lib/kb/cache";`
- Delete line 5: `import { buildKbLookupTools } from "@/lib/kb/tools";`
- Replace the `Promise.all` (lines 98-101) with:
```ts
  const publicKbText = await getCachedPublicKbText(accountId, lang);
```
- Delete line 120: `      ...buildKbLookupTools(parsedKb),`

- [ ] **Step 3: Update `lib/mcp/server.ts`**

- Line 3: change `import { getCachedKb, getCachedPublicKbText } from "@/lib/kb/cache";` to `import { getCachedPublicKbText } from "@/lib/kb/cache";`
- Delete line 9: `import { buildKbLookupTools } from "@/lib/kb/tools";`
- Delete line 66: `const parsedKb = await getCachedKb(accountId);`
- Delete line 75: `                  ...buildKbLookupTools(parsedKb),`

- [ ] **Step 4: Update `components/chat.tsx`**

Replace the thinking-label ternary (lines 190-193) with the constant generic label:
```ts
  const thinkingLabel = t.thinking.generic;
```
Then check whether `activeToolName` is still referenced anywhere in the file:

Run: `grep -n "activeToolName" components/chat.tsx`
- If there are no other references, remove its import/definition (it will otherwise be an unused-symbol lint error). If it is still used elsewhere, leave it.

- [ ] **Step 5: Verify the chat + MCP modules typecheck in isolation**

Run: `pnpm typecheck 2>&1 | grep -E "handle-chat|mcp/server|components/chat" || echo "no errors in these files"`
Expected: `no errors in these files` (repo-wide errors from other not-yet-updated files are expected and ignored here).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(chat): remove lookup_code_entries tool and its wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `cv-config` — drop the `code` filter, `chat.featured_code`, `getFeaturedCodeSlugs`

**Files:**
- Modify: `lib/kb/cv-config.ts`
- Test: `tests/lib/kb/cv-config.test.ts`

- [ ] **Step 1: Rewrite the cv-config test**

Overwrite `tests/lib/kb/cv-config.test.ts` with:
```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadCvConfig } from "@/lib/kb/cv-config";

async function withTmpDir<T>(yaml: string | null, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-config-test-"));
  try {
    if (yaml !== null) await fs.writeFile(path.join(dir, "cv-config.yaml"), yaml, "utf8");
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("loadCvConfig", () => {
  it("parses section filters", async () => {
    await withTmpDir(`projects:\n  all: true\nexperience:\n  include:\n    - a\n`, async (dir) => {
      const cfg = await loadCvConfig(dir);
      expect(cfg?.projects).toEqual({ all: true });
      expect(cfg?.experience).toEqual({ include: ["a"] });
    });
  });

  it("rejects an unknown top-level key (strict schema)", async () => {
    await expect(
      withTmpDir(`chat:\n  featured_code:\n    - x\n`, (dir) => loadCvConfig(dir)),
    ).rejects.toThrow();
  });

  it("returns null when the file is absent", async () => {
    await withTmpDir(null, async (dir) => {
      expect(await loadCvConfig(dir)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/cv-config.test.ts`
Expected: FAIL — `chat`/`code` still accepted; `getFeaturedCodeSlugs` import removed but schema still has `code`.

- [ ] **Step 3: Update `lib/kb/cv-config.ts`**

- Delete the `ChatBlockSchema` block (lines 23-28).
- In `CvConfigSchema` (lines 30-40), delete the `code: SectionFilterSchema,` and `chat: ChatBlockSchema,` lines.
- In `filterKbForCv` (lines 94-111), delete the `code: whitelist(...)` property (lines 101-103).
- Delete the `getFeaturedCodeSlugs` function entirely (lines 113-122).
- Update the identifier doc comments on lines 14 and 16 to drop `code`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/cv-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cv-config.ts tests/lib/kb/cv-config.test.ts
git commit -m "feat(kb): drop code filter, chat.featured_code, getFeaturedCodeSlugs from cv-config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `cache.ts` — remove featured wiring and now-dead cv-config caching

**Files:**
- Modify: `lib/kb/cache.ts`

- [ ] **Step 1: Update imports**

Change line 5 from:
```ts
import { loadCvConfig, getFeaturedCodeSlugs, type CvConfig } from "@/lib/kb/cv-config";
```
to: (delete the line entirely — `cache.ts` no longer needs cv-config; the CV route loads it directly.)

- [ ] **Step 2: Remove the cv-config cache plumbing**

- Delete the `cvConfigByAccount` map (line 37).
- Delete the `getCvConfig` function (lines 40-44).
- In `resetKbCache`, delete both `cvConfigByAccount.clear();` (line 50) and `cvConfigByAccount.delete(accountId);` (line 56).

- [ ] **Step 3: Simplify `getCachedPublicKbText`**

Replace its body (lines 77-79) with:
```ts
  const kb = await getCachedKb(accountId, lang);
  const text = assemblePublicKbText(kb);
```

- [ ] **Step 4: Verify cache typechecks**

Run: `pnpm typecheck 2>&1 | grep "lib/kb/cache.ts" || echo "cache.ts clean"`
Expected: `cache.ts clean`.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cache.ts
git commit -m "refactor(kb): drop featured-code + cv-config caching from public KB text cache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `manifest.ts` + delete `code-index.ts`

**Files:**
- Modify: `lib/kb/manifest.ts`
- Delete: `lib/kb/code-index.ts`

- [ ] **Step 1: Update `lib/kb/manifest.ts`**

- Delete line 5: `import { loadCodeIndex, type CodeIndex } from "@/lib/kb/code-index";`
- In `KbFileMeta`, delete `code_bytes?: number;` (line 26).
- In `pickMeta`, delete `code_bytes: asNumber(data.code_bytes),` (line 80).
- Replace `readMarkdown` (lines 94-110) with the version that drops the code-index merge:
```ts
async function readMarkdown(
  absPath: string,
  relPath: string,
): Promise<{ title: string; meta?: KbFileMeta }> {
  const raw = await fs.readFile(absPath, "utf8");
  const { data, content } = matter(raw);
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : humanize(relPath);
  const meta = pickMeta(data as Record<string, unknown>);
  return meta ? { title, meta } : { title };
}
```
- Replace `walk` (lines 112-137) so it no longer threads `codeIndex` and no longer special-cases `code/index.yaml`:
```ts
async function walk(dir: string, baseDir: string, out: KbFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, baseDir, out);
      continue;
    }
    const rel = path.relative(baseDir, abs);
    const type = fileTypeFromPath(rel);
    if (!type) continue;
    if (/\.[a-z]{2}\.(md|yaml)$/.test(rel)) continue;
    if (type === "md") {
      const { title, meta } = await readMarkdown(abs, rel);
      out.push({ path: rel, title, type, ...(meta ? { meta } : {}) });
    } else {
      out.push({ path: rel, title: humanize(rel), type });
    }
  }
}
```
- Replace `loadKbManifest` (lines 143-149) with:
```ts
export async function loadKbManifest(kbDir: string): Promise<KbFile[]> {
  const out: KbFile[] = [];
  await walk(kbDir, kbDir, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
```

- [ ] **Step 2: Delete the code-index module**

```bash
git rm lib/kb/code-index.ts
```

- [ ] **Step 3: Verify these files typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "manifest.ts|code-index" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(kb): drop code-index registry and code_bytes from manifest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CV components — aggregated "Repositories" via `allRepos`

**Files:**
- Modify: `components/cv/cv-document.tsx`
- Modify: `components/cv/cv-panel-view.tsx`

- [ ] **Step 1: `cv-document.tsx` — import `allRepos`, compute repos, render from them**

Change the import on line 3 to also import `allRepos`:
```ts
import { allRepos, type Kb, type KbLang } from "@/lib/kb/loader";
```
At the top of `CvDocumentView`, after `const fmt = ...` (line 42), add:
```ts
  const repos = allRepos(kb);
```
Replace the final `{kb.code.length > 0 && ( ... )}` block (lines 238-260) with:
```tsx
      {repos.length > 0 && (
        <section className="cv-section mb-3">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.code}
          </h2>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug">
            {repos.map((o, i) => (
              <li key={`${o.name}-${i}`} className="cv-entry">
                {o.url ? (
                  <a
                    href={o.url}
                    className="font-display font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
                  >
                    {o.name}
                  </a>
                ) : (
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">{o.name}</span>
                )}
                <span className="text-[var(--color-text-tertiary)]"> · {o.role}</span>
                {o.description && (
                  <span className="text-[var(--color-text-secondary)]"> — {o.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
```
(`o` is now a `Repo`, so fields are accessed directly — `o.url`, not `o.frontmatter.url`.)

- [ ] **Step 2: `cv-panel-view.tsx` — same swap in the markdown serializer**

The `assembleCvMarkdown` helper takes `kb: import("@/lib/kb/loader").Kb`. Add an import of `allRepos` at the top of the file:
```ts
import { allRepos } from "@/lib/kb/loader";
```
Replace the `if (kb.code.length > 0) { ... }` block (lines 173-179) with:
```ts
  const repos = allRepos(kb);
  if (repos.length > 0) {
    lines.push("");
    lines.push(`## Open source`);
    for (const o of repos) {
      const url = o.url ? ` (${o.url})` : "";
      lines.push(`- **${o.name}**${url} — ${o.role}${o.description ? `: ${o.description}` : ""}`);
    }
  }
```

- [ ] **Step 3: Verify these components typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "cv-document|cv-panel-view" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add components/cv/cv-document.tsx components/cv/cv-panel-view.tsx
git commit -m "feat(cv): aggregate Repositories section from project repos via allRepos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: KB panel file list — remove the now-empty `code` group/variant

**Files:**
- Modify: `components/kb/kb-file-list.tsx`

Rationale: `kb/code/` files no longer exist, so the `code` group is always empty, `file.meta?.code_bytes` no longer typechecks (removed in Task 7), and the entire `variant === "code"` rendering path is dead. Remove it all — there is now exactly one row variant.

- [ ] **Step 1: Replace `GROUP_ORDER`, `groupOf`, and delete `sortGroup` + `formatBytes`**

Replace lines 12-47 (from the `GROUP_ORDER` comment through the end of `formatBytes`) with:
```ts
/** Order in which directory groups appear under the "Referenced" section. */
const GROUP_ORDER = ["experience", "projects", "talks", "recommendations", "other"] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

/** Returns the directory group a file belongs to. Files at the kb/ root
 * (profile.yaml, skills.yaml, education.yaml, public-contact.yaml) and any
 * unknown subdirectory fall into "other". */
function groupOf(file: KbFile): GroupKey {
  const top = file.path.split("/")[0];
  if (top === "experience" || top === "projects" || top === "talks" || top === "recommendations") {
    return top;
  }
  return "other";
}
```
(This deletes `sortGroup` and `formatBytes` entirely — both were code-only.)

- [ ] **Step 2: Simplify `FileRow` to a single variant**

Replace the whole `FileRow` component (the original lines 49-174) with:
```tsx
function FileRow({
  file,
  cited,
  onOpen,
}: {
  file: KbFile;
  cited: boolean;
  onOpen: (path: string) => void;
}) {
  const subtitle = metaSubtitle(file.meta);

  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
        cited
          ? "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.06)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
      )}
    >
      {cited && (
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[13px]",
              cited ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
            )}
          >
            {file.title}
          </span>
        </span>

        {subtitle && (
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
            {subtitle}
          </span>
        )}
      </span>

      <span
        className="ml-1 shrink-0 self-start font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.16em" }}
      >
        {file.type}
      </span>
    </button>
  );
}
```
(`useKb` is no longer called inside `FileRow` or `Group`; the import stays because `KbFileList` still calls it. The repo-specific badges, the open-repo link, and the `strings.openRepo`/`privateBadge`/`collapseGroup`/`expandGroup` usages were all code-only and are removed — leaving those keys unused in the strings object is harmless.)

- [ ] **Step 3: Make `Group` non-collapsible and drop the `code` render branch**

Replace the whole `Group` component (the original lines 176-244) with:
```tsx
/** Section with a header + count. */
function Group({
  label,
  files,
  onOpen,
}: {
  label: string;
  files: KbFile[];
  onOpen: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL} style={LABEL_STYLE}>
          {label}
        </span>
        <span className={LABEL} style={LABEL_STYLE}>
          {files.length}
        </span>
      </div>
      {files.map((f) => (
        <FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update `KbFileList` call sites**

In `KbFileList`:
- In the `grouped` initializer, remove the `code: [],` line so it reads:
```ts
  const grouped: Record<GroupKey, KbFile[]> = {
    experience: [],
    projects: [],
    talks: [],
    recommendations: [],
    other: [],
  };
```
- Delete the line `for (const key of GROUP_ORDER) grouped[key] = sortGroup(grouped[key], key);` (sortGroup no longer exists; manifest order is fine).
- In the pinned block, the `FileRow` call drops `variant`: `<FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />`.
- In the cited block, replace `variant={groupOf(f) === "code" ? "code" : "default"}` with nothing (drop the prop): `<FileRow key={f.path} file={f} cited onOpen={onOpen} />`.
- In the `GROUP_ORDER.map`, drop the `collapsible={key === "code"}` prop:
```tsx
      {GROUP_ORDER.map((key) => (
        <Group key={key} label={strings.sections[key]} files={grouped[key]} onOpen={onOpen} />
      ))}
```

> `strings.sections[key]` is now indexed by the narrower `GroupKey` (no `code`). If TypeScript complains that `strings.sections` still declares a `code` key, that's fine — indexing a wider record with a narrower key is valid. Do NOT remove `code` from the strings object unless tsc demands it.

- [ ] **Step 5: Verify it typechecks**

Run: `pnpm typecheck 2>&1 | grep "kb-file-list" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add components/kb/kb-file-list.tsx
git commit -m "refactor(kb-panel): remove empty code group and code_bytes variant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `validate-kb.ts` — update the counts output

**Files:**
- Modify: `scripts/validate-kb.ts`

- [ ] **Step 1: Replace the code count with a repo count derived from projects**

Add an import at the top:
```ts
import { loadKb, allRepos } from "../lib/kb/loader";
```
Replace the projects/code log lines (lines 30 and 32) so the block reads:
```ts
  const repoCount = allRepos(kb).length;
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  console.log(`  experience:      ${kb.experience.length} entries`);
  console.log(`  projects:        ${kb.projects.length} entries (${repoCount} repos)`);
  console.log(`  talks:           ${kb.talks.length} entries`);
  console.log(`  recommendations: ${kb.recommendations.length} entries`);
  console.log(`  skills:          ${kb.skills.skills.length} entries`);
```
(Delete the old `code:` line.)

- [ ] **Step 2: Smoke-test against the test fixture**

Run: `PERSONA_LOCAL_OVERRIDE=tests/fixtures pnpm validate:kb`
Expected: prints `projects: 1 entries (2 repos)` (the persona fixture root has the four core YAML under `tests/fixtures/kb` — if the validator needs `persona.yaml`, point it at a checkout that has one; the `kb/`-only assertion here is `projects: 1 entries (2 repos)`).

> If `validate:kb` errors because `tests/fixtures` lacks `kb/` at the expected depth, run it against any local content repo you have; the only behavior to confirm is the new "(N repos)" line renders.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-kb.ts
git commit -m "chore(scripts): validate:kb reports repo count under projects

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Full-suite gate after the core change

**Files:** none (verification)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS. If any test still references `kb.code`, `RepoFrontmatterSchema`, `lookup_code_entries`, `featured_code`, or `getFeaturedCodeSlugs`, fix it now (grep below).

Run: `grep -rn -E "kb\.code|RepoFrontmatter|lookup_code|featured_code|getFeaturedCodeSlugs|code_bytes|code-index|RepoEntry" lib components app scripts tests | grep -v "graphify-out/"`
Expected: no matches (docs handled in Task 15; `docs/superpowers/**` historical files are out of scope).

- [ ] **Step 2: Typecheck, lint, build**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: build succeeds (this also runs ESLint).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test(kb): green suite after code→projects merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Skip if nothing changed.)

---

### Task 12: Repurpose the bulk importer into a single-repo enrich helper

**Files:**
- Rename/rewrite: `scripts/import-github-repos.ts` → `scripts/enrich-repo.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/enrich-repo.ts`**

```bash
git rm scripts/import-github-repos.ts
```
Create `scripts/enrich-repo.ts`:
```ts
/**
 * Enrich a single GitHub repo into a paste-ready `repos:` YAML block for a
 * project's front-matter. Replaces the old bulk importer.
 *
 *   pnpm enrich:repo <owner/name | https://github.com/owner/name> [--role author|maintainer|contributor]
 *
 * Prints a YAML list item (two-space indented) to stdout. Pipe or copy it under
 * a project's `repos:` key.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractReadmeParagraph,
  buildPublicFrontmatter,
  type GhRepo,
  type RepoRole,
} from "./lib/github-repos";

const exec = promisify(execFile);

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function parseTarget(arg: string): string {
  const m = arg.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  const slug = m ? m[1] : arg;
  if (!/^[^/]+\/[^/]+$/.test(slug)) {
    throw new Error(`Expected "owner/name" or a github.com URL, got: ${arg}`);
  }
  return slug;
}

function lastActiveFromPushedAt(pushedAt: string): string | undefined {
  const d = new Date(pushedAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toYaml(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`    ${k}: [${v.map((x) => JSON.stringify(x)).join(", ")}]`);
    } else if (typeof v === "string") {
      lines.push(`    ${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`    ${k}: ${v}`);
    }
  }
  // First key becomes the list item ("- name: ...").
  lines[0] = lines[0].replace(/^ {4}/, "  - ");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("Usage: pnpm enrich:repo <owner/name | url> [--role author|maintainer|contributor]");
    process.exit(1);
  }
  const roleArg = args[args.indexOf("--role") + 1];
  const role: RepoRole =
    roleArg === "maintainer" || roleArg === "contributor" ? roleArg : "author";

  const slug = parseTarget(target);
  const json = await gh([
    "repo", "view", slug,
    "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
  ]);
  const repo = JSON.parse(json) as GhRepo;

  const fm = buildPublicFrontmatter(repo, role);
  let body: string | null = null;
  if (!repo.isPrivate) {
    try {
      const readme = await gh(["api", `repos/${slug}/readme`, "--jq", ".content"]);
      body = extractReadmeParagraph(Buffer.from(readme.trim(), "base64").toString("utf8"));
    } catch { /* no readme */ }
  }

  const yaml = toYaml({
    name: fm.name,
    role: fm.role,
    visibility: repo.isPrivate ? "private" : "public",
    url: repo.isPrivate ? undefined : fm.url,
    description: fm.description ?? body ?? undefined,
    language: fm.language,
    year: fm.year,
    last_active: lastActiveFromPushedAt(repo.pushedAt),
    stars: repo.isPrivate ? undefined : fm.stars,
    archived: fm.archived ? true : undefined,
    tags: fm.tags,
  });

  console.log(yaml);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
```

(No change needed to `scripts/lib/github-repos.ts` — its `RepoFm` already has no `code_bytes`, and `buildPublicFrontmatter`/`extractReadmeParagraph` are reused as-is.)

- [ ] **Step 2: Update `package.json`**

Change the `import:github` script (line 14) to:
```json
    "enrich:repo": "tsx scripts/enrich-repo.ts",
```

- [ ] **Step 3: Typecheck the script**

Run: `pnpm typecheck 2>&1 | grep -E "enrich-repo|import-github" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add scripts/enrich-repo.ts package.json
git commit -m "feat(scripts): replace bulk importer with single-repo enrich helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Lossless `code → projects` migration codemod

**Files:**
- Create: `scripts/migrate-code-to-projects.ts`
- Create: `tests/scripts/migrate-code-to-projects.test.ts`
- Modify: `package.json`

The codemod is **analysis-first**: a dry run reads every `kb/code/*.md`, proposes a `project → repos` grouping, and writes a review plan. A second invocation applies a (human-reviewed) plan. It guarantees losslessness: every code slug appears exactly once in the plan, and apply asserts repos-written == repos-read.

- [ ] **Step 1: Write the failing logic test**

Create `tests/scripts/migrate-code-to-projects.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { proposePlan, type CodeRepo } from "@/scripts/migrate-code-to-projects";

const REPOS: CodeRepo[] = [
  { slug: "a", repo: { name: "a", role: "author", tags: ["ai"] }, body: "" },
  { slug: "b", repo: { name: "b", role: "author", tags: ["ai"] }, body: "" },
  { slug: "c", repo: { name: "c", role: "author" }, body: "" },
];

describe("proposePlan", () => {
  it("groups repos by their primary tag, tagless under open-source", () => {
    const plan = proposePlan(REPOS);
    const ai = plan.projects.find((p) => p.slug === "ai");
    const os = plan.projects.find((p) => p.slug === "open-source");
    expect(ai?.repos).toEqual(["a", "b"]);
    expect(os?.repos).toEqual(["c"]);
  });

  it("is lossless — every input slug appears exactly once", () => {
    const plan = proposePlan(REPOS);
    const assigned = plan.projects.flatMap((p) => p.repos).sort();
    expect(assigned).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `scripts/migrate-code-to-projects.ts`**

```ts
/**
 * Migrate a content repo's `kb/code/*.md` into project `repos:` arrays — losslessly.
 *
 *   # 1. Analyze + write a review plan (dry run, writes kb/code/_migration-plan.yaml)
 *   pnpm migrate:code --root ../my-content-repo
 *
 *   # 2. After reviewing/editing the plan, apply it
 *   pnpm migrate:code --root ../my-content-repo --apply kb/code/_migration-plan.yaml
 *
 * Apply assertion: every code slug appears exactly once in the plan, and the
 * number of repos written equals the number of code files read. Refuses to
 * delete a code file whose repo was not written into a project.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type CodeRepo = {
  slug: string;
  repo: Record<string, unknown>; // RepoSchema-shaped (minus code_bytes)
  body: string;
};

export type Plan = {
  projects: Array<{ slug: string; name: string; repos: string[] }>;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Group by first tag; tagless repos land under a single `open-source` project. */
export function proposePlan(repos: CodeRepo[]): Plan {
  const groups = new Map<string, string[]>();
  for (const r of repos) {
    const tags = (r.repo.tags as string[] | undefined) ?? [];
    const key = tags.length ? slugify(tags[0]) : "open-source";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.slug);
  }
  return {
    projects: [...groups.entries()].map(([slug, repoSlugs]) => ({
      slug,
      name: slug === "open-source" ? "Open source" : slug.replace(/-/g, " "),
      repos: repoSlugs.sort(),
    })),
  };
}

async function readCodeRepos(codeDir: string): Promise<CodeRepo[]> {
  let files: string[];
  try {
    files = await fs.readdir(codeDir);
  } catch {
    return [];
  }
  const md = files.filter((f) => f.endsWith(".md") && !/\.[a-z]{2}\.md$/.test(f)).sort();
  const out: CodeRepo[] = [];
  for (const f of md) {
    const raw = await fs.readFile(path.join(codeDir, f), "utf8");
    const { data, content } = matter(raw);
    const { code_bytes, ...rest } = data as Record<string, unknown>; // drop code_bytes
    void code_bytes;
    out.push({ slug: f.replace(/\.md$/, ""), repo: rest, body: content.trim() });
  }
  return out;
}

function assertLossless(repos: CodeRepo[], plan: Plan): void {
  const assigned = plan.projects.flatMap((p) => p.repos);
  const seen = new Set(assigned);
  if (assigned.length !== seen.size) throw new Error("Plan assigns a repo to more than one project.");
  const inputSlugs = new Set(repos.map((r) => r.slug));
  for (const slug of inputSlugs) if (!seen.has(slug)) throw new Error(`Repo "${slug}" is not assigned in the plan.`);
  for (const slug of seen) if (!inputSlugs.has(slug)) throw new Error(`Plan references unknown repo "${slug}".`);
}

async function applyPlan(root: string, repos: CodeRepo[], plan: Plan): Promise<void> {
  assertLossless(repos, plan);
  const bySlug = new Map(repos.map((r) => [r.slug, r]));
  const projectsDir = path.join(root, "kb", "projects");
  await fs.mkdir(projectsDir, { recursive: true });
  let written = 0;

  for (const proj of plan.projects) {
    const file = path.join(projectsDir, `${proj.slug}.md`);
    const reposFm = proj.repos.map((s) => {
      const r = bySlug.get(s)!;
      written++;
      return { ...r.repo, name: r.repo.name ?? s };
    });
    let fm: Record<string, unknown>;
    let body: string;
    try {
      const existing = matter(await fs.readFile(file, "utf8"));
      fm = existing.data as Record<string, unknown>;
      body = existing.content.trim();
      fm.repos = [...((fm.repos as unknown[]) ?? []), ...reposFm];
    } catch {
      fm = { name: proj.name, repos: reposFm };
      body = `Repositories grouped under ${proj.name}.`;
    }
    const content = `---\n${stringifyYaml(fm)}---\n\n${body}\n`;
    await fs.writeFile(file, content, "utf8");
  }

  if (written !== repos.length) {
    throw new Error(`Lossless check failed: wrote ${written} repos but read ${repos.length}.`);
  }

  // Safe to remove the old code/ tree only after every repo was written.
  await fs.rm(path.join(root, "kb", "code"), { recursive: true, force: true });
  console.log(`Migrated ${written} repos into ${plan.projects.length} projects; removed kb/code/.`);
}

async function main() {
  const args = process.argv.slice(2);
  const root = args[args.indexOf("--root") + 1] ?? process.env.PERSONA_LOCAL_OVERRIDE;
  if (!root) throw new Error("Pass --root <content-repo> or set PERSONA_LOCAL_OVERRIDE.");
  const codeDir = path.join(root, "kb", "code");
  const repos = await readCodeRepos(codeDir);
  if (repos.length === 0) throw new Error(`No kb/code/*.md found under ${root}.`);

  const applyIdx = args.indexOf("--apply");
  if (applyIdx === -1) {
    const plan = proposePlan(repos);
    const planPath = path.join(codeDir, "_migration-plan.yaml");
    await fs.writeFile(planPath, stringifyYaml(plan), "utf8");
    console.log(`Proposed ${plan.projects.length} projects for ${repos.length} repos.`);
    console.log(`Review/edit the plan, then re-run with --apply ${planPath}`);
    if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
  } else {
    const planPath = args[applyIdx + 1];
    const plan = parseYaml(await fs.readFile(planPath, "utf8")) as Plan;
    await applyPlan(root, repos, plan);
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate-code-to-projects.ts")) {
  main().catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  });
}
```

Note the `if (process.argv[1] ...)` guard so importing the module in the test does not execute `main()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the package script**

In `package.json`, add next to the other scripts:
```json
    "migrate:code": "tsx scripts/migrate-code-to-projects.ts",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-code-to-projects.ts tests/scripts/migrate-code-to-projects.test.ts package.json
git commit -m "feat(scripts): lossless analysis-driven code→projects migration codemod

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Persona test fixtures (`cv-config.yaml`, `system.md`)

**Files:**
- Modify: `tests/fixtures/persona/cv-config.yaml`
- Modify: `tests/fixtures/persona/prompts/system.md`

- [ ] **Step 1: Trim the fixture `cv-config.yaml`**

In `tests/fixtures/persona/cv-config.yaml`, delete the `code:` section (lines 37-38) and the entire `chat:` block with its comment (lines 40-67). Also update the identifier comment on line 11 to drop `code`. The file should end after the `talks:` block.

- [ ] **Step 2: Trim the fixture `system.md`**

In `tests/fixtures/persona/prompts/system.md`, remove the bullet that instructs the agent about the `# Code (index)` section and `lookup_code_entries` (around lines 13-17 — the paragraph beginning "When the prompt contains a `# Code (index)` section"). Read the file first to get the exact lines.

- [ ] **Step 3: Verify no fixture still references the removed machinery**

Run: `grep -rn -E "featured_code|lookup_code|# Code \(index\)|^code:" tests/fixtures/`
Expected: no matches.

- [ ] **Step 4: Re-run any tests that load the persona fixture**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/persona/
git commit -m "test(fixtures): drop code/featured_code/lookup from persona fixtures

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Documentation

**Files:**
- Modify: `docs/content-repo-guide.md`
- Modify: `docs/agent-context.md`
- Delete: `docs/CODE_ENTRY_TEMPLATE.md`
- Check: `README.md`

- [ ] **Step 1: `docs/content-repo-guide.md` — layout (§2)**

In the repo-layout block (lines 47-58), delete the four `code/...` lines and add `repos:` under `projects/`:
```
  projects/<slug>.md     (+ <slug>.fr.md)        [optional; may carry a repos: array]
  talks/<slug>.md        (+ <slug>.fr.md)        [optional]
  recommendations/<slug>.md (+ <slug>.fr.md)     [optional]
```
In the "Required vs optional" paragraph (line 71-72), change the folder list from `experience/, projects/, talks/, code/, and recommendations/` to `experience/, projects/, talks/, and recommendations/`.

- [ ] **Step 2: `docs/content-repo-guide.md` — narrative entries (§6)**

Replace the `### kb/code/<slug>.md + kb/code/index.yaml` subsection (lines 329-368) with a new subsection under projects titled **"Attaching repos to a project"**:
```markdown
### Attaching repos to a project

A project can host the repositories that back it. Add a `repos:` array to the
project's front-matter — each entry carries repo metadata plus a one-line
`description` (the project body holds the narrative):

\```yaml
---
name: openpipe
year: 2024
stack: [Rust, WASM]
url: https://github.com/jordanrivera/openpipe
repos:
  - name: openpipe
    url: https://github.com/jordanrivera/openpipe
    role: author              # author | maintainer | contributor
    visibility: public        # public | private (default: public)
    description: "Streaming pipeline core."
    language: Rust
    year: 2024
    last_active: "2025-05"     # YYYY-MM
    stars: 240
    archived: false
    stack: [Rust, WASM]
    tags: [tooling, rust]      # free-form
---

A streaming data pipeline that…
\```

`name` and `role` are required per repo; everything else is optional. Tags are
free-form (no registry). To fill repo metadata from GitHub, run
`pnpm enrich:repo <owner/name>` and paste the printed block under `repos:`.
```
(Use real triple backticks in the doc; the `\`` above are escaped only for this plan.)

- [ ] **Step 3: `docs/content-repo-guide.md` — system.md tool reference (§4)**

Delete the `lookup_code_entries` bullet (lines 136-139). Repos are always inlined under their project now, so there is no on-demand code tool.

- [ ] **Step 4: `docs/content-repo-guide.md` — cv-config (§8)**

In the `cv-config.yaml` example (lines 388-414), delete the `code:` section and the entire `chat: / featured_code:` block and its comment. Update the identifier-reference line (416-417) to drop `code`.

- [ ] **Step 5: `docs/content-repo-guide.md` — citations (§10) + validate (§11) + troubleshooting (§14)**

- §10 (lines 459-460): delete the "For large code collections… `lookup_code_entries`" paragraph.
- §10 examples (line 447): citations for repos now point at the parent project, e.g. `[^kb:projects/openpipe.md]`. Add a note: "Repos are cited via their parent project file."
- §11 expected output (lines 476-481): replace the `projects: 4 entries` example line with `projects: 4 entries (9 repos)` and remove any `code:` line.
- §14 troubleshooting table: delete the `kb/code/<slug>: unknown tag(s)` row (line 537).
- §15 checklist (line 554-555): change "`code/` (+ `code/index.yaml`)" to "and attach repos to projects via `repos:`".

- [ ] **Step 6: `docs/agent-context.md`**

Read the file, then update every reference found by:
```bash
grep -n -E "lookup_code|featured_code|featuredCode|# Code|getFeaturedCodeSlugs|code/<slug>|kb/code" docs/agent-context.md
```
- Remove `lookup_code_entries` from the tools row (line 42) and the dedicated tool subsection (line 58) and the example flow (line 77).
- In the assembly steps (lines 47-49), remove the `chat.featured_code` / `featuredCodeSlugs` / `# Code (featured)` / `# Code (index)` description; replace with: "`assemblePublicKbText(kb)` renders each project with its `repos:` listed beneath it under `### Repositories`."
- In the file-map table (lines 114-115), drop the `getFeaturedCodeSlugs` mention from the cv-config row and delete the `lib/kb/tools.ts` row.

- [ ] **Step 7: Delete the obsolete code-entry template + check README**

```bash
git rm docs/CODE_ENTRY_TEMPLATE.md
grep -rn "CODE_ENTRY_TEMPLATE" . --include=README.md --include="*.md" | grep -v "graphify-out/" | grep -v "docs/superpowers/"
```
Expected: no matches (if README links it, remove that link). Also confirm the README's mention of the content-repo guide still resolves.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: document repos-under-projects; remove code-category docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final verification gate

**Files:** none (verification)

- [ ] **Step 1: Full quality gate**

Run: `pnpm test`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: build succeeds (this also runs ESLint).

- [ ] **Step 2: Final residue sweep**

Run:
```bash
grep -rn -E "kb\.code|RepoFrontmatter|RepoEntry|lookup_code|featured_code|getFeaturedCodeSlugs|code_bytes|code-index|loadCodeIndex|resolveRepoTags|import-github" lib components app scripts tests | grep -v "graphify-out/"
```
Expected: no matches.

- [ ] **Step 3: Manual preview smoke (optional but recommended)**

Point a local content repo (with at least one project carrying `repos:`) via `PERSONA_LOCAL_OVERRIDE`, start the dev server, and confirm: the chat answers a repo question citing the parent project; the `/cv` page shows the aggregated "Open source" / Repositories section; the KB panel lists the project file (no empty Code group).

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for code→projects merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** schema (T1), loader+allRepos (T2), assembler (T3), tool removal (T4), cv-config (T5), cache (T6), manifest+code-index (T7), CV components (T8), panel (T9), validate (T10), enrich (T12), codemod (T13), fixtures (T14), docs (T15). All spec sections map to a task.
- **Migration is human-in-the-loop:** Task 13 produces a reviewable plan; the *actual* first-cut grouping for the real content repo is decided with the user at execution time (run `pnpm migrate:code --root <repo>`, review `_migration-plan.yaml` together, then `--apply`). The codemod only guarantees losslessness; it does not auto-finalize groupings.
- **Type consistency:** `RepoSchema` → type `Repo`; `allRepos(kb): Repo[]`; CV components consume `Repo` (flat fields, not `.frontmatter`). `ProjectFrontmatter.repos?: Repo[]`.
- **Red window:** repo-wide `tsc` is red between T2 and T11 by design; T11 is the first full-green gate.

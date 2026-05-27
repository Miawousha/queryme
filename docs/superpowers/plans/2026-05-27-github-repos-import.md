# GitHub Repos → KB Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `kb/open-source/` with a broader `kb/code/` section (public + private repos), extend the schema, and ship an import script that seeds one-paragraph entries from `gh` CLI.

**Architecture:** Phase 1 is a pure rename + schema extension that leaves the existing single `queryme.md` entry intact. Phase 2 adds a `scripts/import-github-repos.ts` operator-run tool that fetches data via `gh` CLI and writes idempotent markdown files (never clobbers existing files without `--force`).

**Tech Stack:** TypeScript, Next.js 15, Zod 4, Vitest, `gh` CLI, gray-matter (already in deps).

Spec: [docs/superpowers/specs/2026-05-27-github-repos-import-design.md](../specs/2026-05-27-github-repos-import-design.md).

---

## File Structure

### Phase 1: Schema + folder rename

**Modified:**
- `lib/kb/schemas.ts` — replace `OpenSourceFrontmatterSchema` with `RepoFrontmatterSchema`, keep type-alias export under the old name during transition? **No** — single PR, hard rename, update all call sites in the same commit (project convention: no back-compat shims).
- `lib/kb/loader.ts` — folder string `"open-source"` → `"code"`, schema/type names updated, field `openSource` on `Kb` → `code`, type `OpenSourceEntry` → `RepoEntry`.
- `lib/kb/assembler.ts` — `renderOpenSource` → `renderRepos`, section header `# Open source` → `# Code`, iterates `kb.code`.
- `app/cv/strings.ts` — `openSource` key + label stays `"Open source"` for the printable CV (we're not changing the CV section label, only the KB folder + internal naming — see "User-facing labels" note below).
- `app/cv/page.tsx` — `kb.openSource` → `kb.code`, label key stays `t.sections.openSource`.
- `scripts/validate-kb.ts` — log line updated.
- `tests/lib/kb/loader.test.ts` — path string, field name, fixture path.
- `tests/lib/kb/manifest.test.ts` — expected path string.
- `tests/lib/kb/assembler.test.ts` — section header + ref string.
- `tests/lib/kb/schemas.test.ts` — `OpenSourceFrontmatterSchema` → `RepoFrontmatterSchema`, add cases for new fields.

**Moved (git mv):**
- `kb/open-source/queryme.md` → `kb/code/queryme.md`
- `kb/open-source/queryme.fr.md` → `kb/code/queryme.fr.md`
- `tests/fixtures/kb/open-source/queryme.md` → `tests/fixtures/kb/code/queryme.md`

**User-facing labels**: the printed CV section header stays `"Open source"` (English) / `"Open source"` (French) for now — the new folder also holds private repos, but the CV print only renders entries where `visibility === "public"` (see Task 6). A future change can introduce a "Code" tab in the chat UI; this plan does not touch the CV label.

### Phase 2: Import script

**Created:**
- `scripts/import-github-repos.ts` — CLI entry, orchestrates fetch + write
- `scripts/lib/github-repos.ts` — pure helpers (slug, frontmatter builder, README paragraph extractor), unit-tested
- `tests/scripts/lib/github-repos.test.ts` — unit tests for the helpers

**Modified:**
- `package.json` — add `"import:github"` script

---

## Phase 1: Schema + folder rename

### Task 1: Add `RepoFrontmatterSchema` (TDD)

**Files:**
- Modify: `lib/kb/schemas.ts:93-101`
- Modify: `tests/lib/kb/schemas.test.ts:122-141`

- [ ] **Step 1: Replace the failing schema test**

Edit `tests/lib/kb/schemas.test.ts`. Replace the `OpenSourceFrontmatterSchema` describe block (lines 122-141) and update the import on line 10:

```ts
// line 10: replace OpenSourceFrontmatterSchema with RepoFrontmatterSchema
import {
  // ...
  RepoFrontmatterSchema,
  // ...
} from "@/lib/kb/schemas";

// replace describe block:
describe("RepoFrontmatterSchema", () => {
  it("accepts a minimal public repo (visibility defaults to public)", () => {
    const parsed = RepoFrontmatterSchema.parse({
      name: "queryme",
      url: "https://github.com/Miawousha/queryme",
      role: "author",
    });
    expect(parsed.visibility).toBe("public");
  });

  it("accepts a private repo without a url", () => {
    expect(() =>
      RepoFrontmatterSchema.parse({
        name: "internal-tool",
        role: "author",
        visibility: "private",
      }),
    ).not.toThrow();
  });

  it("accepts optional language/stars/archived fields", () => {
    const parsed = RepoFrontmatterSchema.parse({
      name: "x",
      url: "https://example.com/x",
      role: "author",
      language: "TypeScript",
      stars: 42,
      archived: true,
    });
    expect(parsed.language).toBe("TypeScript");
    expect(parsed.stars).toBe(42);
    expect(parsed.archived).toBe(true);
  });

  it("rejects an invalid role", () => {
    expect(() =>
      RepoFrontmatterSchema.parse({
        name: "x",
        url: "https://example.com/x",
        role: "owner",
      }),
    ).toThrow();
  });

  it("rejects an invalid visibility", () => {
    expect(() =>
      RepoFrontmatterSchema.parse({
        name: "x",
        role: "author",
        visibility: "secret",
      }),
    ).toThrow();
  });

  it("rejects negative stars", () => {
    expect(() =>
      RepoFrontmatterSchema.parse({
        name: "x",
        url: "https://example.com/x",
        role: "author",
        stars: -1,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/lib/kb/schemas.test.ts`
Expected: FAIL with `RepoFrontmatterSchema is not exported` (or similar import error).

- [ ] **Step 3: Replace the schema in `lib/kb/schemas.ts`**

Replace lines 93-101 (the `OpenSourceFrontmatterSchema` block) with:

```ts
export const RepoFrontmatterSchema = z.object({
  name: z.string().min(1),
  url: z.url().optional(),
  role: z.enum(["author", "maintainer", "contributor"]),
  visibility: z.enum(["public", "private"]).default("public"),
  description: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  language: z.string().optional(),
  stars: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type RepoFrontmatter = z.infer<typeof RepoFrontmatterSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm test tests/lib/kb/schemas.test.ts`
Expected: PASS (6 tests in the RepoFrontmatterSchema describe block).

The rest of `pnpm test` will fail at this point — that's fine, the next tasks fix it. Don't commit yet.

---

### Task 2: Update `lib/kb/loader.ts` to use new schema + folder

**Files:**
- Modify: `lib/kb/loader.ts`

- [ ] **Step 1: Update imports**

Replace lines 5-24 in `lib/kb/loader.ts`:

```ts
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RepoFrontmatterSchema,
  RecommendationFrontmatterSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type RepoFrontmatter,
  type RecommendationFrontmatter,
} from "./schemas";
```

- [ ] **Step 2: Rename `OpenSourceEntry` type to `RepoEntry`**

Replace lines 47-52:

```ts
export type RepoEntry = {
  slug: string;
  relativePath: string;
  frontmatter: RepoFrontmatter;
  body: string;
};
```

- [ ] **Step 3: Update the `Kb` type**

Replace line 69: `openSource: OpenSourceEntry[];` → `code: RepoEntry[];`

- [ ] **Step 4: Update the loader directory + schema reference**

Replace line 183:

```ts
readMarkdownDir(path.join(rootDir, "code"), RepoFrontmatterSchema, "code", lang),
```

- [ ] **Step 5: Update destructuring + sort + return**

Lines 171-205, rename every `openSource` → `code`:

```ts
const [
  profile, skills, education, publicContact,
  experience, projects,
  talks, code, recommendations,
] = await Promise.all([
  // ... (existing yaml reads unchanged)
  readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience", lang),
  readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects", lang),
  readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks", lang),
  readMarkdownDir(path.join(rootDir, "code"), RepoFrontmatterSchema, "code", lang),
  readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations", lang),
]);

experience.sort((a, b) => (startSortKey(a.frontmatter.start) < startSortKey(b.frontmatter.start) ? 1 : -1));
projects.sort((a, b) => (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0));
talks.sort((a, b) => b.frontmatter.year - a.frontmatter.year);
code.sort((a, b) =>
  (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0) || a.frontmatter.name.localeCompare(b.frontmatter.name),
);
recommendations.sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));

return {
  profile,
  skills,
  education,
  publicContact,
  experience,
  projects,
  talks,
  code,
  recommendations,
};
```

- [ ] **Step 6: Run typecheck to surface remaining usages**

Run: `pnpm typecheck`
Expected: errors in `lib/kb/assembler.ts`, `scripts/validate-kb.ts`, `app/cv/page.tsx` — the next tasks fix them.

---

### Task 3: Update `lib/kb/assembler.ts`

**Files:**
- Modify: `lib/kb/assembler.ts:13`
- Modify: `lib/kb/assembler.ts:113-125`

- [ ] **Step 1: Update the section dispatch on line 13**

Replace `if (kb.openSource.length) sections.push(renderOpenSource(kb));` with:

```ts
if (kb.code.length) sections.push(renderRepos(kb));
```

- [ ] **Step 2: Rename + update the renderer (lines 113-125)**

Replace `renderOpenSource` with:

```ts
function renderRepos(kb: Kb): string {
  const lines = [`# Code`, ``];
  for (const p of kb.code) {
    lines.push(`## ${p.frontmatter.name}`);
    lines.push(`[ref: ${p.relativePath}]`);
    lines.push(`Role: ${p.frontmatter.role}`);
    lines.push(`Visibility: ${p.frontmatter.visibility}`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.language) lines.push(`Language: ${p.frontmatter.language}`);
    if (p.frontmatter.description) lines.push(`Description: ${p.frontmatter.description}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``, p.body, ``);
  }
  return lines.join("\n");
}
```

Note: `URL` line is now conditional because private repos may omit it.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: remaining errors only in `app/cv/page.tsx` and `scripts/validate-kb.ts`.

---

### Task 4: Update `app/cv/page.tsx` + `app/cv/strings.ts`

**Files:**
- Modify: `app/cv/page.tsx:267-273`
- Modify: `app/cv/strings.ts` (no changes — kept for clarity)

- [ ] **Step 1: Read the current CV open-source block**

Run: `sed -n '260,290p' app/cv/page.tsx` to inspect.

- [ ] **Step 2: Update `kb.openSource` → `kb.code` and filter to public**

In `app/cv/page.tsx` around line 267, change the block to:

```tsx
{kb.code.filter((o) => o.frontmatter.visibility === "public").length > 0 && (
  // ... existing section markup ...
  {t.sections.openSource}
  // ...
  {kb.code
    .filter((o) => o.frontmatter.visibility === "public")
    .map((o) => (
      // ... existing item markup ...
    ))}
)}
```

The label key (`t.sections.openSource`) stays — `app/cv/strings.ts` is unchanged. The CV stays an "Open source" section showing only public repos.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: only `scripts/validate-kb.ts` remains.

---

### Task 5: Update `scripts/validate-kb.ts`

**Files:**
- Modify: `scripts/validate-kb.ts:13`

- [ ] **Step 1: Replace the log line**

Line 13 change `open-source: ${kb.openSource.length}` to:

```ts
console.log(`  code:            ${kb.code.length} entries`);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

---

### Task 6: Move actual KB files + fixtures

**Files:**
- Move: `kb/open-source/queryme.md` → `kb/code/queryme.md`
- Move: `kb/open-source/queryme.fr.md` → `kb/code/queryme.fr.md`
- Move: `tests/fixtures/kb/open-source/queryme.md` → `tests/fixtures/kb/code/queryme.md`
- Modify: `kb/code/queryme.md` (add `visibility: public` to frontmatter)
- Modify: `kb/code/queryme.fr.md` (same)
- Modify: `tests/fixtures/kb/code/queryme.md` (same)

- [ ] **Step 1: Move files via `git mv`**

```bash
git mv kb/open-source/queryme.md kb/code/queryme.md
git mv kb/open-source/queryme.fr.md kb/code/queryme.fr.md
git mv tests/fixtures/kb/open-source/queryme.md tests/fixtures/kb/code/queryme.md
rmdir kb/open-source tests/fixtures/kb/open-source
```

- [ ] **Step 2: Add `visibility: public` to each frontmatter**

Edit `kb/code/queryme.md` frontmatter — add `visibility: public` line (the schema defaults it, but being explicit is clearer for hand-edited entries):

```
---
name: queryme
url: https://github.com/Miawousha/queryme
role: author
visibility: public
description: "Agent-driven CV — answers questions about Alexandre from a YAML/Markdown knowledge base."
year: 2026
tags: [ai, software, typescript, nextjs]
---
```

Apply the same `visibility: public` addition to `kb/code/queryme.fr.md` and `tests/fixtures/kb/code/queryme.md`.

---

### Task 7: Update tests

**Files:**
- Modify: `tests/lib/kb/loader.test.ts:57-65`
- Modify: `tests/lib/kb/manifest.test.ts:20`
- Modify: `tests/lib/kb/assembler.test.ts:72-75`

- [ ] **Step 1: Update `loader.test.ts`**

Lines 57-65 — update test name, field name, and path string:

```ts
it("loads talks, code, and recommendations entries", async () => {
  // ... setup unchanged ...
  expect(kb.code).toHaveLength(1);
  expect(kb.code[0].frontmatter.name).toBe("queryme");
  expect(kb.code[0].frontmatter.visibility).toBe("public");
  expect(kb.code[0].relativePath).toBe("code/queryme.md");
});
```

- [ ] **Step 2: Update `manifest.test.ts`**

Line 20 — replace `"open-source/queryme.md"` with `"code/queryme.md"`.

- [ ] **Step 3: Update `assembler.test.ts`**

Lines 72-75 — replace assertions:

```ts
it("includes a Code section with [ref: code/...] markers", () => {
  // ... setup unchanged ...
  expect(text).toContain("# Code");
  expect(text).toContain("[ref: code/queryme.md]");
});
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Run KB validation**

Run: `pnpm validate:kb`
Expected:
```
OK — KB validates and assembles to <N> chars.
  experience:      <N> entries
  projects:        <N> entries
  talks:           <N> entries
  code:            1 entries
  recommendations: <N> entries
  skills:          <N> entries
```

- [ ] **Step 6: Commit Phase 1**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(kb): rename open-source → code, extend schema for private repos

Folder rename + schema rename in one go (no back-compat shim). The new
RepoFrontmatterSchema adds visibility/language/stars/archived and makes
url optional, so private repos can live alongside public ones. Existing
queryme entry gets visibility: public; the printable CV continues to
show only public repos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Import script

### Task 8: Helpers — slug, frontmatter builder, README extractor (TDD)

**Files:**
- Create: `scripts/lib/github-repos.ts`
- Create: `tests/scripts/lib/github-repos.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/scripts/lib/github-repos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  slugifyRepoName,
  extractReadmeParagraph,
  buildPublicFrontmatter,
  buildPrivateFrontmatter,
  type GhRepo,
} from "@/scripts/lib/github-repos";

describe("slugifyRepoName", () => {
  it("lowercases and replaces non-alphanumerics with hyphens", () => {
    expect(slugifyRepoName("Foo.Bar_Baz")).toBe("foo-bar-baz");
  });
  it("collapses runs of separators", () => {
    expect(slugifyRepoName("a---b__c")).toBe("a-b-c");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugifyRepoName("-x-")).toBe("x");
  });
});

describe("extractReadmeParagraph", () => {
  it("returns the first non-heading paragraph", () => {
    const md = "# Title\n\nSome intro text.\n\nMore text.";
    expect(extractReadmeParagraph(md)).toBe("Some intro text.");
  });
  it("skips badge-only paragraphs", () => {
    const md = "# Title\n\n![badge](https://img.shields.io/x)\n\nReal intro.";
    expect(extractReadmeParagraph(md)).toBe("Real intro.");
  });
  it("strips inline badges from the paragraph it returns", () => {
    const md = "![badge](https://img.shields.io/x) Real intro continues here.";
    expect(extractReadmeParagraph(md)).toBe("Real intro continues here.");
  });
  it("returns null when there is no usable paragraph", () => {
    expect(extractReadmeParagraph("# Title only\n\n## More headings")).toBeNull();
    expect(extractReadmeParagraph("")).toBeNull();
  });
  it("strips raw HTML tags", () => {
    const md = "<p align=\"center\">Centered intro</p>";
    expect(extractReadmeParagraph(md)).toBe("Centered intro");
  });
});

const baseRepo: GhRepo = {
  name: "ExampleRepo",
  description: "An example.",
  url: "https://github.com/Miawousha/ExampleRepo",
  isPrivate: false,
  isArchived: false,
  isFork: false,
  primaryLanguage: { name: "TypeScript" },
  stargazerCount: 12,
  repositoryTopics: [{ name: "cli" }, { name: "tooling" }],
  createdAt: "2024-03-15T10:00:00Z",
  pushedAt: "2025-06-01T10:00:00Z",
};

describe("buildPublicFrontmatter", () => {
  it("maps gh fields to KB frontmatter", () => {
    const fm = buildPublicFrontmatter(baseRepo, "author");
    expect(fm).toEqual({
      name: "ExampleRepo",
      url: "https://github.com/Miawousha/ExampleRepo",
      role: "author",
      visibility: "public",
      description: "An example.",
      year: 2024,
      language: "TypeScript",
      stars: 12,
      archived: false,
      tags: ["cli", "tooling"],
    });
  });
  it("omits empty/undefined fields cleanly", () => {
    const fm = buildPublicFrontmatter(
      { ...baseRepo, description: null, primaryLanguage: null, stargazerCount: 0, repositoryTopics: [] },
      "contributor",
    );
    expect(fm.description).toBeUndefined();
    expect(fm.language).toBeUndefined();
    expect(fm.tags).toBeUndefined();
    expect(fm.stars).toBe(0);
  });
});

describe("buildPrivateFrontmatter", () => {
  it("omits url and sets visibility=private", () => {
    const fm = buildPrivateFrontmatter({ ...baseRepo, isPrivate: true });
    expect(fm.visibility).toBe("private");
    expect(fm.url).toBeUndefined();
    expect(fm.role).toBe("author");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/scripts/lib/github-repos.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement helpers**

Create `scripts/lib/github-repos.ts`:

```ts
export type GhRepo = {
  name: string;
  description: string | null;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  repositoryTopics: { name: string }[];
  createdAt: string;
  pushedAt: string;
};

export type RepoRole = "author" | "maintainer" | "contributor";

export type RepoFm = {
  name: string;
  url?: string;
  role: RepoRole;
  visibility: "public" | "private";
  description?: string;
  year?: number;
  language?: string;
  stars?: number;
  archived?: boolean;
  tags?: string[];
};

export function slugifyRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BADGE_RE = /!\[[^\]]*\]\([^)]+\)/g;
const HTML_TAG_RE = /<[^>]+>/g;

function cleanParagraph(p: string): string {
  return p.replace(BADGE_RE, "").replace(HTML_TAG_RE, "").replace(/\s+/g, " ").trim();
}

export function extractReadmeParagraph(md: string): string | null {
  if (!md.trim()) return null;
  const paragraphs = md.split(/\n\s*\n/);
  for (const raw of paragraphs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;        // heading
    const cleaned = cleanParagraph(trimmed);
    if (!cleaned) continue;                          // was badge-only
    return cleaned;
  }
  return null;
}

function pickYear(createdAt: string): number {
  return new Date(createdAt).getUTCFullYear();
}

export function buildPublicFrontmatter(repo: GhRepo, role: RepoRole): RepoFm {
  const fm: RepoFm = {
    name: repo.name,
    url: repo.url,
    role,
    visibility: "public",
    year: pickYear(repo.createdAt),
    stars: repo.stargazerCount,
    archived: repo.isArchived,
  };
  if (repo.description) fm.description = repo.description;
  if (repo.primaryLanguage?.name) fm.language = repo.primaryLanguage.name;
  const tags = repo.repositoryTopics.map((t) => t.name).filter(Boolean);
  if (tags.length) fm.tags = tags;
  return fm;
}

export function buildPrivateFrontmatter(repo: GhRepo): RepoFm {
  const fm: RepoFm = {
    name: repo.name,
    role: "author",
    visibility: "private",
    year: pickYear(repo.createdAt),
    archived: repo.isArchived,
  };
  if (repo.description) fm.description = repo.description;
  if (repo.primaryLanguage?.name) fm.language = repo.primaryLanguage.name;
  const tags = repo.repositoryTopics.map((t) => t.name).filter(Boolean);
  if (tags.length) fm.tags = tags;
  return fm;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/scripts/lib/github-repos.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/github-repos.ts tests/scripts/lib/github-repos.test.ts
git commit -m "$(cat <<'EOF'
feat(scripts): add pure helpers for github→KB frontmatter import

Slug, readme-paragraph extractor, and public/private frontmatter
builders. Side-effect-free so the CLI in the next commit stays thin
and the helpers are unit-tested without hitting gh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: CLI script that fetches via `gh` and writes files

**Files:**
- Create: `scripts/import-github-repos.ts`
- Modify: `package.json` (add script entry)

- [ ] **Step 1: Implement the CLI**

Create `scripts/import-github-repos.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  slugifyRepoName,
  extractReadmeParagraph,
  buildPublicFrontmatter,
  buildPrivateFrontmatter,
  type GhRepo,
  type RepoFm,
} from "./lib/github-repos";

const exec = promisify(execFile);
const GH_USER = "Miawousha";
const KB_DIR = path.resolve(process.cwd(), "kb/code");
const FORCE = process.argv.includes("--force");

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

async function checkGhAuth(): Promise<void> {
  try {
    await exec("gh", ["auth", "status"]);
  } catch {
    console.error("FAIL: gh CLI is not authenticated. Run `gh auth login` and retry.");
    process.exit(1);
  }
}

async function listOwnedRepos(): Promise<GhRepo[]> {
  const stdout = await gh([
    "repo", "list", GH_USER,
    "--limit", "500",
    "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
  ]);
  const repos = JSON.parse(stdout) as GhRepo[];
  return repos.filter((r) => !r.isFork);
}

type PrSearchResult = { repository: { nameWithOwner: string; isPrivate: boolean; url: string } };

async function listContributedRepos(): Promise<string[]> {
  // Returns owner/name strings for distinct PUBLIC repos Alex has merged PRs into,
  // excluding repos he owns (covered by listOwnedRepos).
  const stdout = await gh([
    "search", "prs",
    "--author", GH_USER,
    "--state", "merged",
    "--limit", "500",
    "--json", "repository",
  ]);
  const prs = JSON.parse(stdout) as PrSearchResult[];
  const seen = new Set<string>();
  for (const pr of prs) {
    const { nameWithOwner, isPrivate } = pr.repository;
    if (isPrivate) continue;
    if (nameWithOwner.startsWith(`${GH_USER}/`)) continue;
    seen.add(nameWithOwner);
  }
  return [...seen].sort();
}

async function fetchReadme(ownerSlashName: string): Promise<string | null> {
  try {
    const stdout = await gh(["api", `repos/${ownerSlashName}/readme`, "--jq", ".content"]);
    return Buffer.from(stdout.trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function fetchRepoMeta(ownerSlashName: string): Promise<GhRepo | null> {
  try {
    const stdout = await gh([
      "repo", "view", ownerSlashName,
      "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
    ]);
    return JSON.parse(stdout) as GhRepo;
  } catch {
    return null;
  }
}

function frontmatterToYaml(fm: RepoFm): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${JSON.stringify(fm.name)}`);
  if (fm.url) lines.push(`url: ${fm.url}`);
  lines.push(`role: ${fm.role}`);
  lines.push(`visibility: ${fm.visibility}`);
  if (fm.description) lines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.year !== undefined) lines.push(`year: ${fm.year}`);
  if (fm.language) lines.push(`language: ${JSON.stringify(fm.language)}`);
  if (fm.stars !== undefined) lines.push(`stars: ${fm.stars}`);
  if (fm.archived !== undefined) lines.push(`archived: ${fm.archived}`);
  if (fm.tags?.length) lines.push(`tags: [${fm.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
  lines.push("---", "");
  return lines.join("\n");
}

async function writeEntry(slug: string, fm: RepoFm, body: string, needsSanitization: boolean): Promise<"wrote" | "skipped"> {
  const file = path.join(KB_DIR, `${slug}.md`);
  if (!FORCE) {
    try {
      await fs.access(file);
      return "skipped";
    } catch { /* missing → write */ }
  }
  const todo = needsSanitization
    ? "<!-- TODO: sanitize — auto-imported from private repo, review before commit -->\n\n"
    : "";
  const content = frontmatterToYaml(fm) + todo + body + "\n";
  await fs.writeFile(file, content, "utf8");

  // French sidecar stub (only if missing — never overwrite)
  const frFile = path.join(KB_DIR, `${slug}.fr.md`);
  try {
    await fs.access(frFile);
  } catch {
    await fs.writeFile(frFile, content, "utf8");
  }
  return "wrote";
}

async function main() {
  await checkGhAuth();
  await fs.mkdir(KB_DIR, { recursive: true });

  console.log(`Fetching owned repos for ${GH_USER}...`);
  const owned = await listOwnedRepos();
  console.log(`  → ${owned.length} non-fork repos (${owned.filter((r) => r.isPrivate).length} private)`);

  console.log("Fetching contributed-to public repos...");
  const contributedNames = await listContributedRepos();
  console.log(`  → ${contributedNames.length} unique non-owned repos`);

  let wrote = 0;
  let skipped = 0;
  let privateCount = 0;

  // Owned repos
  for (const repo of owned) {
    const slug = slugifyRepoName(repo.name);
    let body: string;
    let fm: RepoFm;
    let needsSanitization = false;

    if (repo.isPrivate) {
      fm = buildPrivateFrontmatter(repo);
      body = repo.description ?? "No description available.";
      needsSanitization = true;
      privateCount++;
    } else {
      fm = buildPublicFrontmatter(repo, "author");
      const readme = await fetchReadme(`${GH_USER}/${repo.name}`);
      const para = readme ? extractReadmeParagraph(readme) : null;
      body = para ?? repo.description ?? "No description available.";
    }

    const result = await writeEntry(slug, fm, body, needsSanitization);
    if (result === "wrote") wrote++;
    else skipped++;
  }

  // Contributed-to repos
  for (const nameWithOwner of contributedNames) {
    const repo = await fetchRepoMeta(nameWithOwner);
    if (!repo) {
      console.warn(`  ! could not fetch meta for ${nameWithOwner}, skipping`);
      continue;
    }
    const slug = slugifyRepoName(repo.name);
    const fm = buildPublicFrontmatter(repo, "contributor");
    const readme = await fetchReadme(nameWithOwner);
    const para = readme ? extractReadmeParagraph(readme) : null;
    const body = para ?? repo.description ?? "No description available.";
    const result = await writeEntry(slug, fm, body, false);
    if (result === "wrote") wrote++;
    else skipped++;
  }

  console.log(`\nDone. Wrote ${wrote} entries, skipped ${skipped} existing.`);
  if (privateCount > 0) {
    console.log(`${privateCount} private entries written — search for "TODO: sanitize" in kb/code/ and review before committing.`);
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `package.json` script**

Edit `package.json` scripts block — add:

```json
"import:github": "tsx scripts/import-github-repos.ts"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Dry-run import to a throwaway directory first**

This verifies the script doesn't blow up before touching `kb/`. Temporarily run from a scratch checkout, OR check by running with a small allowlist. Simplest: just run it — the idempotency check protects you (existing `queryme.md` won't be overwritten).

Run: `pnpm import:github`
Expected: prints owned/contributed counts, writes new files to `kb/code/`, skips `queryme.md`, prints a final summary listing the number of private entries needing sanitization.

- [ ] **Step 5: Spot-check 2-3 generated files**

```bash
ls kb/code/
cat kb/code/<some-new-public-slug>.md
cat kb/code/<some-new-private-slug>.md  # should have "TODO: sanitize" header
```

Verify:
- Frontmatter parses (run `pnpm validate:kb` — Expected: PASS, with `code: N entries`)
- Private entries have the `<!-- TODO: sanitize -->` comment
- French sidecars exist with same content

- [ ] **Step 6: Stage public entries; review private ones interactively**

```bash
git status kb/code/
```

For every file with `TODO: sanitize`:
1. Open the file
2. Confirm the body says nothing employer/NDA-sensitive
3. Either edit the body (sanitize) and remove the TODO comment, or `git rm` the file if the repo shouldn't be surfaced at all

- [ ] **Step 7: Commit the import**

```bash
git add kb/code/ package.json scripts/import-github-repos.ts
git commit -m "$(cat <<'EOF'
feat(kb): import owned + contributed-to repos via gh CLI

Adds scripts/import-github-repos.ts (operator-run, idempotent). Seeds
kb/code/ with one-paragraph entries pulled from gh: owned non-fork
repos (public + private) plus public repos where Miawousha has merged
PRs. Private entries are written with sanitization TODOs that have
been reviewed and cleared.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Final verification**

Run: `pnpm test && pnpm typecheck && pnpm validate:kb`
Expected: all PASS, validate-kb shows the new entry count under `code:`.

---

## Out-of-scope follow-ups

- French translation of the generated `<slug>.fr.md` stubs (they currently mirror English) — manual pass, separate PR
- "Code" or "Repositories" tab in the chat UI — the assembler now emits a `# Code` section that the agent will pull from; surfacing it as a dedicated UI tab is a separate design
- Refresh job (cron, GitHub Action) that re-runs the import periodically — script is operator-run for now

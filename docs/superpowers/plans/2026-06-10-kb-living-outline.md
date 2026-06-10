# KB Living-Outline Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat KB file list with a hierarchical tree (collections → folders → docs → section headings) where citations pin to exact sections, per the approved spec `docs/superpowers/specs/2026-06-10-kb-living-outline-design.md`.

**Architecture:** Server side, the manifest walker extracts h2/h3 headings (locale-resolved) into `KbFile.sections`; the manifest endpoint and LRU cache become lang-aware. Client side, a pure `buildKbTree()` derives the tree from manifest + citations + filter/lens, a `KbTree` component replaces `KbFileList`, and the viewer gains anchor scroll/highlight via a shared slugger. Chat citation numbering becomes conversation-global so tree chips and superscripts agree.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Tailwind v4 + CSS vars, vitest, gray-matter, react-markdown.

**Conventions:** Run all commands from the repo root `/Users/alexandrecollet/queryme`. Package manager is pnpm. Tests: `pnpm vitest run <file>` for one file, `pnpm test` for the suite, `pnpm typecheck` for tsc.

**A discovered constraint encoded in this plan:** today `rewriteCitations` in `components/chat-message.tsx` numbers citations per message (`let i = 0` resets each message). The spec requires tree chips to match chat superscripts, so Task 7 makes numbering conversation-global: `Chat` derives an index map from `citedRefs` and passes it down.

---

### Task 1: Shared slugger (`lib/kb/slug.ts`)

**Files:**
- Create: `lib/kb/slug.ts`
- Test: `tests/lib/kb/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, normalizeAnchor, anchorMatches } from "@/lib/kb/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Battery Telemetry")).toBe("battery-telemetry");
  });

  it("strips punctuation but keeps letters, numbers, hyphens", () => {
    expect(slugify("Team & role (2025)")).toBe("team-role-2025");
  });

  it("collapses whitespace and hyphen runs, trims edge hyphens", () => {
    expect(slugify("  A  --  B  ")).toBe("a-b");
  });

  it("keeps accented letters (unicode-aware)", () => {
    expect(slugify("Équipe télémétrie")).toBe("équipe-télémétrie");
  });
});

describe("normalizeAnchor / anchorMatches", () => {
  it("treats underscores and dots as hyphens", () => {
    expect(normalizeAnchor("team_role.2025")).toBe("team-role-2025");
  });

  it("matches a model-invented anchor against the real slug", () => {
    expect(anchorMatches("Battery-Telemetry", "battery-telemetry")).toBe(true);
    expect(anchorMatches("battery_telemetry", "battery-telemetry")).toBe(true);
  });

  it("rejects a different section", () => {
    expect(anchorMatches("overview", "battery-telemetry")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/slug.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/slug`.

- [ ] **Step 3: Write the implementation**

Create `lib/kb/slug.ts`:

```ts
/**
 * Shared heading-slug logic. Used by the manifest builder (server), the KB
 * viewer's heading ids (client), and citation-anchor matching — all three
 * must agree, so this is the single home.
 */

/** GitHub-style slug of a heading: lowercase, punctuation stripped, spaces → hyphens. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loose normalization for anchor comparison — the model invents its own
 * kebab-case slugs, so every non-alphanumeric run collapses to one hyphen. */
export function normalizeAnchor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** True when a cited anchor refers to the given section slug. */
export function anchorMatches(anchor: string, slug: string): boolean {
  return normalizeAnchor(anchor) === normalizeAnchor(slug);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/slug.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/slug.ts tests/lib/kb/slug.test.ts
git commit -m "feat(kb): shared heading slugger with loose anchor matching"
```

---

### Task 2: Section extraction (`lib/kb/sections.ts`)

**Files:**
- Create: `lib/kb/sections.ts`
- Test: `tests/lib/kb/sections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractSections } from "@/lib/kb/sections";

describe("extractSections", () => {
  it("extracts h2 and h3 headings with levels, ignoring h1 and h4", () => {
    const body = "# Title\n\n## Overview\n\ntext\n\n### Detail\n\n#### Deep\n";
    expect(extractSections(body)).toEqual([
      { slug: "overview", title: "Overview", level: 2 },
      { slug: "detail", title: "Detail", level: 3 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const body = "## Real\n\n```md\n## Fake\n```\n\n~~~\n## Also fake\n~~~\n\n## After\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["real", "after"]);
  });

  it("suffixes duplicate slugs like GitHub (-1, -2)", () => {
    const body = "## Setup\n\n## Setup\n\n## Setup\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["setup", "setup-1", "setup-2"]);
  });

  it("strips trailing closing hashes from titles", () => {
    const body = "## Closed heading ##\n";
    expect(extractSections(body)).toEqual([
      { slug: "closed-heading", title: "Closed heading", level: 2 },
    ]);
  });

  it("skips headings that slugify to nothing", () => {
    const body = "## !!!\n## Ok\n";
    expect(extractSections(body).map((s) => s.slug)).toEqual(["ok"]);
  });

  it("returns [] for a body with no h2/h3", () => {
    expect(extractSections("just text\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/sections`.

- [ ] **Step 3: Write the implementation**

Create `lib/kb/sections.ts` (pure — no node imports, safe for client bundles):

```ts
import { slugify } from "@/lib/kb/slug";

/** A linkable section of a markdown KB document. */
export type KbSection = {
  slug: string;
  title: string;
  level: 2 | 3;
};

const HEADING_RE = /^(##|###)\s+(.+?)\s*#*\s*$/;

/**
 * Extracts h2/h3 headings from a markdown body (frontmatter already
 * stripped), skipping fenced code blocks. Duplicate slugs get -1, -2 …
 * suffixes, mirroring GitHub, so ids stay unique and deterministic.
 */
export function extractSections(body: string): KbSection[] {
  const out: KbSection[] = [];
  const used = new Map<string, number>();
  let fenceChar: string | null = null;
  for (const line of body.split("\n")) {
    const fence = line.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (fenceChar === null) fenceChar = ch;
      else if (fenceChar === ch) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    const m = line.match(HEADING_RE);
    if (!m) continue;
    const level = (m[1].length === 2 ? 2 : 3) as 2 | 3;
    const title = m[2].trim();
    let slug = slugify(title);
    if (!slug) continue;
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n}`;
    out.push({ slug, title, level });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/sections.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/sections.ts tests/lib/kb/sections.test.ts
git commit -m "feat(kb): markdown section extraction with fence and duplicate handling"
```

---

### Task 3: Sections + locale variants in the manifest

**Files:**
- Modify: `lib/kb/file-type.ts` (add `KbLocale`)
- Modify: `lib/kb/manifest.ts`
- Test: `tests/lib/kb/manifest.test.ts` (append describes)

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/kb/manifest.test.ts` (it already imports `path`, `os`, `fs`, `loadKbManifest`):

```ts
describe("loadKbManifest — sections", () => {
  it("extracts h2/h3 sections for markdown files and omits the key otherwise", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-sections-"));
    try {
      await fs.writeFile(
        path.join(dir, "doc.md"),
        "---\ntitle: Doc\n---\n# Doc\n\n## Overview\n\n### Detail\n",
      );
      await fs.writeFile(path.join(dir, "plain.md"), "no headings here\n");
      await fs.writeFile(path.join(dir, "data.yaml"), "k: v\n");

      const manifest = await loadKbManifest(dir);
      const doc = manifest.find((f) => f.path === "doc.md");
      expect(doc?.sections).toEqual([
        { slug: "overview", title: "Overview", level: 2 },
        { slug: "detail", title: "Detail", level: 3 },
      ]);
      expect(manifest.find((f) => f.path === "plain.md")?.sections).toBeUndefined();
      expect(manifest.find((f) => f.path === "data.yaml")?.sections).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadKbManifest — locale-resolved titles and sections", () => {
  it("reads the .fr sidecar for title/sections when lang=fr, keeping canonical paths", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-lang-"));
    try {
      await fs.writeFile(path.join(dir, "note.md"), "# English note\n\n## Setup\n");
      await fs.writeFile(path.join(dir, "note.fr.md"), "# Note française\n\n## Mise en place\n");

      const en = await loadKbManifest(dir, "en");
      const fr = await loadKbManifest(dir, "fr");

      expect(en.map((f) => f.path)).toEqual(["note.md"]);
      expect(fr.map((f) => f.path)).toEqual(["note.md"]);
      expect(en[0].title).toBe("English note");
      expect(fr[0].title).toBe("Note française");
      expect(fr[0].sections).toEqual([{ slug: "mise-en-place", title: "Mise en place", level: 2 }]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the canonical file when no sidecar exists for the lang", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-lang-fb-"));
    try {
      await fs.writeFile(path.join(dir, "only-en.md"), "# Only english\n\n## Part\n");
      const fr = await loadKbManifest(dir, "fr");
      expect(fr[0].title).toBe("Only english");
      expect(fr[0].sections?.[0].slug).toBe("part");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/manifest.test.ts`
Expected: FAIL — `sections` undefined; `loadKbManifest` ignores the second argument (TS error in test compile is also acceptable as the failure).

- [ ] **Step 3: Implement**

In `lib/kb/file-type.ts`, add below the `KbFileType` type:

```ts
/** The app's shipped content locales — mirrors the sidecar set in `isLocaleSidecar`. */
export type KbLocale = "en" | "fr";
```

In `lib/kb/manifest.ts`:

1. Extend the imports:

```ts
import { fileTypeFromPath, isLocaleSidecar, type KbFileType, type KbLocale } from "@/lib/kb/file-type";
import { extractSections, type KbSection } from "@/lib/kb/sections";
```

2. Re-export the section type and extend `KbFile`:

```ts
export type { KbSection } from "@/lib/kb/sections";

export type KbFile = {
  /** Path relative to the kb directory, e.g. "experience/2025-altergo.md". */
  path: string;
  /** Human-readable title for the file list. */
  title: string;
  type: KbFileType;
  /** Parsed frontmatter, present only for markdown files that have any. */
  meta?: KbFileMeta;
  /** h2/h3 headings, present only for markdown files that have any. */
  sections?: KbSection[];
};
```

3. Replace `readMarkdown` with a sections-aware version:

```ts
/**
 * Reads a markdown file once: derives the title (first `# Heading`, falling
 * back to the humanized path), the parsed frontmatter, and the h2/h3 section
 * outline.
 */
async function readMarkdown(
  absPath: string,
  relPath: string,
): Promise<{ title: string; meta?: KbFileMeta; sections?: KbSection[] }> {
  const raw = await fs.readFile(absPath, "utf8");
  const { data, content } = matter(raw);
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  const stem = path.basename(relPath, path.extname(relPath));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : humanizeSlug(stem);
  const meta = pickMeta(data as Record<string, unknown>);
  const sections = extractSections(content);
  return {
    title,
    ...(meta ? { meta } : {}),
    ...(sections.length > 0 ? { sections } : {}),
  };
}
```

4. Add a locale resolver above `walk` and thread `lang` through:

```ts
/** Resolves the localized sidecar (foo.fr.md) when it exists; canonical otherwise.
 * Mirrors the read-time resolution in handleKbFile so tree labels and section
 * slugs always match what the viewer renders. */
async function localizedVariant(abs: string, lang: KbLocale): Promise<string> {
  if (lang === "en") return abs;
  const dot = abs.lastIndexOf(".");
  if (dot <= 0) return abs;
  const candidate = `${abs.slice(0, dot)}.${lang}${abs.slice(dot)}`;
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return abs;
  }
}

async function walk(dir: string, baseDir: string, out: KbFile[], lang: KbLocale): Promise<void> {
```

…and inside `walk`, the recursive call becomes `await walk(abs, baseDir, out, lang);` and the markdown branch becomes:

```ts
    if (type === "md") {
      const source = await localizedVariant(abs, lang);
      const { title, meta, sections } = await readMarkdown(source, rel);
      out.push({
        path: rel,
        title,
        type,
        ...(meta ? { meta } : {}),
        ...(sections ? { sections } : {}),
      });
    } else {
```

5. Update the entry point:

```ts
export async function loadKbManifest(kbDir: string, lang: KbLocale = "en"): Promise<KbFile[]> {
  const out: KbFile[] = [];
  await walk(kbDir, kbDir, out, lang);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/kb/manifest.test.ts tests/lib/kb/handlers.test.ts`
Expected: PASS — all existing manifest/handler tests plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/file-type.ts lib/kb/manifest.ts tests/lib/kb/manifest.test.ts
git commit -m "feat(kb): manifest carries locale-resolved h2/h3 sections per markdown file"
```

---

### Task 4: Lang-aware cache, handler, and route

**Files:**
- Modify: `lib/kb/cache.ts:41,84-90`
- Modify: `lib/kb/handlers.ts:21-40`
- Modify: `app/api/a/[username]/kb/route.ts`
- Test: `tests/lib/kb/handlers.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/kb/handlers.test.ts`:

```ts
describe("handleKbManifest — lang", () => {
  it("serves a manifest for both locales (files present, groups stable)", async () => {
    const en = await (await handleKbManifest(ACCOUNT_ID, "en")).json();
    const fr = await (await handleKbManifest(ACCOUNT_ID, "fr")).json();
    expect(en.files.length).toBeGreaterThan(0);
    expect(fr.files.length).toBe(en.files.length);
    expect(fr.groups).toEqual(en.groups);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/handlers.test.ts`
Expected: FAIL — `handleKbManifest` takes 1 argument (TS) / lang ignored.

- [ ] **Step 3: Implement**

In `lib/kb/cache.ts`:

1. Add `KbLocale` to the manifest import: `import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";` stays, and add `import type { KbLocale } from "@/lib/kb/file-type";`
2. Replace the manifest map declaration (line 41) with:

```ts
const manifestByAccount = new Map<string, Map<KbLocale, KbFile[]>>();
```

3. Replace `getCachedKbManifest` (lines 83-90) with the same nested-map pattern `getCachedContent` uses:

```ts
/** The public KB file manifest for an account, locale-resolved. */
export async function getCachedKbManifest(
  accountId: string,
  lang: KbLocale = "en",
): Promise<KbFile[]> {
  let byLang = lruGet(manifestByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(manifestByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const manifest = await loadKbManifest(kbDir(accountId), lang);
  byLang.set(lang, manifest);
  return manifest;
}
```

In `lib/kb/handlers.ts`:

1. Add `import type { KbLocale } from "@/lib/kb/file-type";` (extend the existing file-type import).
2. Change the manifest handler signature and pass-through:

```ts
export async function handleKbManifest(accountId: string, lang: KbLocale = "en"): Promise<Response> {
```

…and inside: `const manifest = await getCachedKbManifest(accountId, lang);`

`handleKbFile` keeps its canonical (en) manifest call — paths are identical across locales, sidecars never enter the manifest.

In `app/api/a/[username]/kb/route.ts`, use the request and forward the lang:

```ts
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }): Promise<Response> {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang") === "fr" ? "fr" : "en";
  return handleKbManifest(account.id, lang);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run tests/lib/kb/handlers.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cache.ts lib/kb/handlers.ts "app/api/a/[username]/kb/route.ts" tests/lib/kb/handlers.test.ts
git commit -m "feat(kb): lang-aware manifest endpoint and cache"
```

---

### Task 5: `extractCitations` with anchors

**Files:**
- Modify: `lib/kb/cited-paths.ts`
- Test: `tests/lib/kb/cited-paths.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/kb/cited-paths.test.ts` (add `extractCitations, citedRefKey` to the import):

```ts
import { extractCitations, citedRefKey } from "@/lib/kb/cited-paths";

describe("extractCitations", () => {
  it("keeps anchors, assigns 1-based first-appearance indices and message ids", () => {
    const messages = [
      { id: "m1", text: "Altergo [^kb:experience/2025-altergo.md#battery-telemetry] built it." },
      { id: "m2", text: "Profile [^kb:profile.yaml] and again [^kb:experience/2025-altergo.md#battery-telemetry]." },
    ];
    expect(extractCitations(messages)).toEqual([
      { path: "experience/2025-altergo.md", anchor: "battery-telemetry", index: 1, messageId: "m1" },
      { path: "profile.yaml", anchor: null, index: 2, messageId: "m2" },
    ]);
  });

  it("treats different anchors on the same file as distinct refs", () => {
    const messages = [{ id: "m1", text: "[^kb:doc.md#a] [^kb:doc.md#b] [^kb:doc.md]" }];
    expect(extractCitations(messages).map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it("returns [] with no citations", () => {
    expect(extractCitations([{ id: "m1", text: "plain" }])).toEqual([]);
  });
});

describe("citedRefKey", () => {
  it("distinguishes anchored from anchorless refs", () => {
    expect(citedRefKey("doc.md", "a")).toBe("doc.md#a");
    expect(citedRefKey("doc.md", null)).toBe("doc.md");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/cited-paths.test.ts`
Expected: FAIL — `extractCitations` not exported.

- [ ] **Step 3: Implement**

Append to `lib/kb/cited-paths.ts` (keep `extractCitedPaths` unchanged — it is still used elsewhere, e.g. admin analytics):

```ts
/** One cited (path, anchor) pair, first-appearance ordered across the conversation. */
export type CitedRef = {
  path: string;
  /** Raw anchor as cited (no '#'), or null for a whole-file reference. */
  anchor: string | null;
  /** 1-based first-appearance index — the number the chat superscripts show. */
  index: number;
  /** Id of the assistant message where the pair first appeared. */
  messageId: string;
};

/** Stable dedup/lookup key for a citation pair. */
export function citedRefKey(path: string, anchor: string | null): string {
  return anchor ? `${path}#${anchor}` : path;
}

/**
 * Extracts the ordered, de-duplicated (path, anchor) citation pairs across a
 * conversation's assistant messages. Order is first-seen; a pair cited twice
 * keeps its first index (footnote semantics).
 */
export function extractCitations(messages: { id: string; text: string }[]): CitedRef[] {
  const seen = new Set<string>();
  const out: CitedRef[] = [];
  for (const m of messages) {
    for (const c of parseCitations(m.text)) {
      const key = citedRefKey(c.path, c.anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ path: c.path, anchor: c.anchor, index: out.length + 1, messageId: m.id });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/kb/cited-paths.test.ts`
Expected: PASS (old + new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cited-paths.ts tests/lib/kb/cited-paths.test.ts
git commit -m "feat(kb): anchor-aware citation extraction with global indices"
```

---

### Task 6: Tree derivation (`lib/kb/tree.ts`)

**Files:**
- Create: `lib/kb/tree.ts`
- Test: `tests/lib/kb/tree.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/kb/tree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildKbTree,
  ancestorIdsFor,
  breadcrumbFor,
  resolveGroups,
  type KbTreeNode,
} from "@/lib/kb/tree";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";

const FILES: KbFile[] = [
  {
    path: "experience/2025-altergo.md",
    title: "2025 — Altergo",
    type: "md",
    meta: { role: "CTO", start: "2025-01-01", tags: ["battery"] },
    sections: [
      { slug: "overview", title: "Overview", level: 2 },
      { slug: "battery-telemetry", title: "Battery telemetry", level: 2 },
    ],
  },
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
  { path: "notes/research/idea.md", title: "Research idea", type: "md" },
  { path: "profile.yaml", title: "Profile", type: "yaml" },
];

const GROUPS = [
  { name: "experience", label: "Experience" },
  { name: "notes", label: "Notes" },
  { name: "other", label: "Other" },
];

function ref(path: string, anchor: string | null, index: number): CitedRef {
  return { path, anchor, index, messageId: "m1" };
}

function find(nodes: KbTreeNode[], id: string): KbTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

const BASE = { files: FILES, groups: GROUPS, citedRefs: [] as CitedRef[], filter: "", lens: false };

describe("buildKbTree — structure", () => {
  it("orders collections per config, nests folders, attaches docs and sections", () => {
    const tree = buildKbTree(BASE);
    expect(tree.map((n) => n.id)).toEqual(["col:experience", "col:notes", "col:other"]);
    expect(find(tree, "dir:notes/research")?.children.map((c) => c.id)).toEqual([
      "doc:notes/research/idea.md",
    ]);
    expect(find(tree, "doc:experience/2025-altergo.md")?.children.map((c) => c.id)).toEqual([
      "sec:experience/2025-altergo.md#overview",
      "sec:experience/2025-altergo.md#battery-telemetry",
    ]);
  });

  it("routes root-level and unknown-dir files to the catch-all", () => {
    const tree = buildKbTree(BASE);
    expect(find(tree, "col:other")?.children.map((c) => c.id)).toEqual(["doc:profile.yaml"]);
  });

  it("counts docs per container and drops empty collections", () => {
    const tree = buildKbTree(BASE);
    expect(find(tree, "col:experience")?.count).toBe(2);
    expect(find(tree, "dir:notes/research")?.count).toBe(1);
    const noOther = buildKbTree({ ...BASE, files: FILES.slice(0, 3) });
    expect(find(noOther, "col:other")).toBeUndefined();
  });
});

describe("buildKbTree — citations", () => {
  it("pins an anchored citation to the section (normalized match) and dots ancestors", () => {
    const refs = [ref("experience/2025-altergo.md", "Battery_Telemetry", 1)];
    const tree = buildKbTree({ ...BASE, citedRefs: refs });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")?.chips).toEqual([1]);
    expect(find(tree, "doc:experience/2025-altergo.md")?.dot).toBe(true);
    expect(find(tree, "col:experience")?.dot).toBe(true);
  });

  it("falls back to the doc node for unmatched or missing anchors", () => {
    const refs = [
      ref("experience/2025-altergo.md", "nope", 1),
      ref("experience/2021-ion.md", null, 2),
    ];
    const tree = buildKbTree({ ...BASE, citedRefs: refs });
    expect(find(tree, "doc:experience/2025-altergo.md")?.chips).toEqual([1]);
    expect(find(tree, "doc:experience/2021-ion.md")?.chips).toEqual([2]);
  });

  it("ignores citations to paths outside the manifest", () => {
    const tree = buildKbTree({ ...BASE, citedRefs: [ref("ghost.md", null, 1)] });
    expect(tree.every((n) => !n.dot)).toBe(true);
  });
});

describe("buildKbTree — filter and lens", () => {
  it("filter keeps matching docs (title, meta) plus ancestors, drops the rest", () => {
    const tree = buildKbTree({ ...BASE, filter: "battery" });
    expect(find(tree, "doc:experience/2025-altergo.md")).toBeDefined();
    expect(find(tree, "doc:experience/2021-ion.md")).toBeUndefined();
    expect(find(tree, "col:notes")).toBeUndefined();
  });

  it("filter matches section titles", () => {
    const tree = buildKbTree({ ...BASE, filter: "telemetry" });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")).toBeDefined();
  });

  it("a matching collection label keeps its whole subtree", () => {
    const tree = buildKbTree({ ...BASE, filter: "notes" });
    expect(find(tree, "doc:notes/research/idea.md")).toBeDefined();
  });

  it("lens prunes to cited branches only", () => {
    const refs = [ref("experience/2025-altergo.md", "battery-telemetry", 1)];
    const tree = buildKbTree({ ...BASE, citedRefs: refs, lens: true });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")).toBeDefined();
    expect(find(tree, "sec:experience/2025-altergo.md#overview")).toBeUndefined();
    expect(find(tree, "doc:experience/2021-ion.md")).toBeUndefined();
    expect(find(tree, "col:notes")).toBeUndefined();
  });

  it("lens and filter compose with AND", () => {
    const refs = [
      ref("experience/2025-altergo.md", null, 1),
      ref("notes/research/idea.md", null, 2),
    ];
    const tree = buildKbTree({ ...BASE, citedRefs: refs, lens: true, filter: "idea" });
    expect(find(tree, "doc:notes/research/idea.md")).toBeDefined();
    expect(find(tree, "doc:experience/2025-altergo.md")).toBeUndefined();
  });
});

describe("ancestorIdsFor", () => {
  it("walks collection → folders → doc for known groups", () => {
    expect(ancestorIdsFor("notes/research/idea.md", new Set(["notes"]))).toEqual([
      "col:notes",
      "dir:notes/research",
      "doc:notes/research/idea.md",
    ]);
  });

  it("routes unknown top dirs and root files through the catch-all", () => {
    expect(ancestorIdsFor("misc/x/y.md", new Set(["notes"]))).toEqual([
      "col:other",
      "dir:misc",
      "dir:misc/x",
      "doc:misc/x/y.md",
    ]);
    expect(ancestorIdsFor("profile.yaml", new Set(["notes"]))).toEqual([
      "col:other",
      "doc:profile.yaml",
    ]);
  });
});

describe("breadcrumbFor / resolveGroups", () => {
  it("builds collection label + intermediate dirs", () => {
    expect(breadcrumbFor("notes/research/idea.md", GROUPS, "Other")).toEqual([
      "Notes",
      "research",
    ]);
    expect(breadcrumbFor("profile.yaml", GROUPS, "Other")).toEqual(["Other"]);
  });

  it("resolveGroups falls back to defaults and always appends the catch-all", () => {
    const resolved = resolveGroups([], "en", { experience: "Experience" }, "Other");
    expect(resolved[0]).toEqual({ name: "experience", label: "Experience" });
    expect(resolved[resolved.length - 1]).toEqual({ name: "other", label: "Other" });
  });

  it("resolveGroups prefers fr labels when lang=fr", () => {
    const resolved = resolveGroups(
      [{ name: "notes", label: { en: "Notes", fr: "Carnets" } }],
      "fr",
      {},
      "Autre",
    );
    expect(resolved[0].label).toBe("Carnets");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/tree.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/tree`.

- [ ] **Step 3: Write the implementation**

Create `lib/kb/tree.ts` (pure module — only type imports from manifest, safe in client bundles):

```ts
import type { KbFile } from "@/lib/kb/manifest";
import type { KbFileType } from "@/lib/kb/file-type";
import type { CitedRef } from "@/lib/kb/cited-paths";
import type { KbGroup } from "@/lib/kb/meta-format";
import { humanizeSlug, metaSubtitle } from "@/lib/kb/meta-format";
import { anchorMatches } from "@/lib/kb/slug";

/** One row of the KB tree. Ids are deterministic:
 * `col:<name>`, `dir:<dir/path>`, `doc:<file path>`, `sec:<file path>#<slug>`. */
export type KbTreeNode = {
  id: string;
  kind: "collection" | "folder" | "doc" | "section";
  label: string;
  /** Doc path (doc and section nodes). */
  path?: string;
  /** Resolved section slug (section nodes). */
  anchor?: string;
  fileType?: KbFileType;
  subtitle?: string | null;
  /** Citation indices pinned to this exact node. */
  chips: number[];
  /** True when a descendant carries chips — visible while collapsed. */
  dot: boolean;
  /** Docs under this container (collection/folder nodes). */
  count?: number;
  children: KbTreeNode[];
};

export type KbResolvedGroup = { name: string; label: string };

/** Fallback when the config carries no groups: the resume preset. */
const DEFAULT_GROUP_NAMES = ["experience", "projects", "talks", "recommendations"];

/** Resolves config groups to display labels for a locale, appending the
 * reserved `other` catch-all. `sectionLabels` is the localized
 * `strings.sections` map used as a label fallback. */
export function resolveGroups(
  configGroups: KbGroup[],
  lang: "en" | "fr",
  sectionLabels: Record<string, string | undefined>,
  otherLabel: string,
): KbResolvedGroup[] {
  const base: KbGroup[] =
    configGroups.length > 0 ? configGroups : DEFAULT_GROUP_NAMES.map((name) => ({ name }));
  const resolved = base.map((g) => ({
    name: g.name,
    label:
      (lang === "fr" ? g.label?.fr : undefined) ??
      g.label?.en ??
      sectionLabels[g.name] ??
      humanizeSlug(g.name),
  }));
  if (!resolved.some((g) => g.name === "other")) {
    resolved.push({ name: "other", label: otherLabel });
  }
  return resolved;
}

/** Deterministic ancestor chain (collection, folders…, doc) for a file path. */
export function ancestorIdsFor(path: string, groupNames: ReadonlySet<string>): string[] {
  const segs = path.split("/");
  const dirs = segs.slice(0, -1);
  const known = dirs.length > 0 && groupNames.has(dirs[0]);
  const ids: string[] = [`col:${known ? dirs[0] : "other"}`];
  for (let i = known ? 1 : 0; i < dirs.length; i++) {
    ids.push(`dir:${dirs.slice(0, i + 1).join("/")}`);
  }
  ids.push(`doc:${path}`);
  return ids;
}

/** Breadcrumb labels for the viewer header: collection label + intermediate dirs. */
export function breadcrumbFor(
  path: string,
  groups: KbResolvedGroup[],
  otherLabel: string,
): string[] {
  const dirs = path.split("/").slice(0, -1);
  const group = dirs.length > 0 ? groups.find((g) => g.name === dirs[0] && g.name !== "other") : undefined;
  if (!group) return [otherLabel, ...dirs];
  return [group.label, ...dirs.slice(1)];
}

export type BuildKbTreeInput = {
  /** Real files only — virtual (pinned) entries render outside the tree. */
  files: KbFile[];
  /** Resolved groups in display order, catch-all included. */
  groups: KbResolvedGroup[];
  citedRefs: CitedRef[];
  /** Case-insensitive substring filter; empty = off. */
  filter: string;
  /** When true, prune to branches that carry citations. */
  lens: boolean;
};

/** Derives the full KB tree: grouping, nesting, citation chips, ancestor
 * dots, then filter/lens pruning. Pure — memoize on inputs at the call site. */
export function buildKbTree(input: BuildKbTreeInput): KbTreeNode[] {
  const { files, groups, citedRefs, filter, lens } = input;
  const groupNames = new Set(groups.filter((g) => g.name !== "other").map((g) => g.name));

  // 1. Citation chips per node id. Anchored refs land on the section whose
  //    slug matches loosely; everything else lands on the doc.
  const chipsByNode = new Map<string, number[]>();
  for (const r of citedRefs) {
    const file = files.find((f) => f.path === r.path);
    if (!file) continue;
    const section = r.anchor ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug)) : undefined;
    const id = section ? `sec:${file.path}#${section.slug}` : `doc:${file.path}`;
    chipsByNode.set(id, [...(chipsByNode.get(id) ?? []), r.index]);
  }

  // 2. Assemble the unpruned tree.
  const roots: KbTreeNode[] = groups.map((g) => ({
    id: `col:${g.name}`,
    kind: "collection",
    label: g.label,
    chips: [],
    dot: false,
    count: 0,
    children: [],
  }));
  const byId = new Map(roots.map((n) => [n.id, n] as const));

  for (const file of files) {
    const ids = ancestorIdsFor(file.path, groupNames);
    let parent = byId.get(ids[0]);
    if (!parent) continue;
    parent.count = (parent.count ?? 0) + 1;
    for (const id of ids.slice(1, -1)) {
      let node = byId.get(id);
      if (!node) {
        const dirPath = id.slice("dir:".length);
        node = {
          id,
          kind: "folder",
          label: dirPath.split("/").pop()!,
          chips: [],
          dot: false,
          count: 0,
          children: [],
        };
        byId.set(id, node);
        parent.children.push(node);
      }
      node.count = (node.count ?? 0) + 1;
      parent = node;
    }
    const docId = `doc:${file.path}`;
    parent.children.push({
      id: docId,
      kind: "doc",
      label: file.title,
      path: file.path,
      fileType: file.type,
      subtitle: metaSubtitle(file.meta),
      chips: chipsByNode.get(docId) ?? [],
      dot: false,
      children: (file.sections ?? []).map((s) => {
        const secId = `sec:${file.path}#${s.slug}`;
        return {
          id: secId,
          kind: "section" as const,
          label: s.title,
          path: file.path,
          anchor: s.slug,
          chips: chipsByNode.get(secId) ?? [],
          dot: false,
          children: [],
        };
      }),
    });
  }

  // 3. Ancestor dots (post-order): dot = a DESCENDANT carries chips.
  function markDots(node: KbTreeNode): boolean {
    let descendants = false;
    for (const c of node.children) descendants = markDots(c) || descendants;
    node.dot = descendants;
    return descendants || node.chips.length > 0;
  }
  for (const r of roots) markDots(r);

  // 4. Prune: filter (label/meta match keeps node + subtree-anchor) AND lens
  //    (only cited branches). Containers vanish when emptied.
  const needle = filter.trim().toLowerCase();
  const fileByPath = new Map(files.map((f) => [f.path, f] as const));

  function matches(node: KbTreeNode): boolean {
    if (node.label.toLowerCase().includes(needle)) return true;
    if (node.kind === "doc") {
      if (node.subtitle?.toLowerCase().includes(needle)) return true;
      const meta = fileByPath.get(node.path!)?.meta;
      const hay = [meta?.company, meta?.role, ...(meta?.tags ?? []), ...(meta?.stack ?? [])];
      return hay.some((h) => h?.toLowerCase().includes(needle));
    }
    return false;
  }

  function prune(node: KbTreeNode, ancestorMatched: boolean): KbTreeNode | null {
    const self = needle === "" ? true : ancestorMatched || matches(node);
    const childAnchor = needle === "" ? false : ancestorMatched || matches(node);
    const children = node.children
      .map((c) => prune(c, childAnchor))
      .filter((c): c is KbTreeNode => c !== null);
    const lensOk = !lens || node.chips.length > 0 || node.dot;
    if (node.kind === "collection" || node.kind === "folder") {
      return children.length > 0 ? { ...node, children } : null;
    }
    if (node.kind === "doc") {
      return (self && lensOk) || children.length > 0 ? { ...node, children } : null;
    }
    return self && lensOk ? { ...node, children: [] } : null;
  }

  return roots
    .map((r) => prune(r, false))
    .filter((r): r is KbTreeNode => r !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/kb/tree.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/tree.ts tests/lib/kb/tree.test.ts
git commit -m "feat(kb): pure tree derivation with chips, dots, filter and lens pruning"
```

---

### Task 7: Strings, context, and chat plumbing

**Files:**
- Modify: `lib/language.ts` (kb blocks, en ~line 88 and fr ~line 176)
- Modify: `components/kb/kb-context.tsx`
- Modify: `components/chat.tsx:12,63,181-186,273`
- Modify: `components/chat-message.tsx:52-67,144-156`
- Modify: `components/home-shell.tsx:54` (no change needed — verify only)
- Test: `tests/components/chat-message.test.tsx`

- [ ] **Step 1: Update the failing component tests first**

In `tests/components/chat-message.test.tsx`, update the two `onOpenArtifact` expectations to include the anchor argument, and add an anchored case:

```ts
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md", null);
```

(both call sites), then append inside the same `describe`:

```ts
  it("passes the anchor through and numbers from citationIndices", async () => {
    const onOpenArtifact = vi.fn();
    render(
      <ChatMessage
        role="assistant"
        text="Built it [^kb:experience/2022-matrice.md#telemetry]."
        agentLabel="agent"
        forwardLabel="forward"
        onOpenArtifact={onOpenArtifact}
        citationIndices={{ "experience/2022-matrice.md#telemetry": 4 }}
      />,
    );
    const btn = await screen.findByRole("button", { name: "[4]" });
    btn.click();
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md", "telemetry");
  });
```

(Match the render-helper style already in that file — if it wraps `render` differently, follow the existing pattern; the assertions above are the contract.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/chat-message.test.tsx`
Expected: FAIL — second argument missing, unknown prop.

- [ ] **Step 3: Add the localized strings**

In `lib/language.ts`, inside the **en** `kb: {` block (after `openCv`), add:

```ts
        filterPlaceholder: "Filter…",
        clearFilter: "Clear filter",
        noMatches: "No documents match.",
        referencedLens: "Referenced",
        referencedLensAria: "Show only documents referenced in this conversation",
        outline: "Outline",
        outlineAria: "Jump to a section",
```

Inside the **fr** `kb: {` block (same position), add:

```ts
        filterPlaceholder: "Filtrer…",
        clearFilter: "Effacer le filtre",
        noMatches: "Aucun document ne correspond.",
        referencedLens: "Référencés",
        referencedLensAria: "Afficher uniquement les documents référencés dans cette conversation",
        outline: "Plan",
        outlineAria: "Aller à une section",
```

- [ ] **Step 4: Rework `KbContext`**

In `components/kb/kb-context.tsx`:

1. Replace the `citedPaths`/`openFilePath` parts of `KbContextValue`:

```ts
import type { CitedRef } from "@/lib/kb/cited-paths";

/** The document + optional section the viewer should show. */
export type KbOpenTarget = { path: string; anchor: string | null };
```

…and in the type:

```ts
  /** Ordered (path, anchor) citation pairs from this conversation. */
  citedRefs: CitedRef[];
  setCitedRefs: (refs: CitedRef[]) => void;
  /** The doc (and optional section) shown in the viewer; null = tree. */
  openTarget: KbOpenTarget | null;
  openFile: (path: string, anchor?: string | null) => void;
  closeFile: () => void;
```

(`citedPaths`, `setCitedPaths`, and `openFilePath` are removed.)

2. Replace the corresponding state and callbacks in `KbProvider`:

```ts
  const [citedRefs, setCitedRefs] = useState<CitedRef[]>([]);
  const [openTarget, setOpenTarget] = useState<KbOpenTarget | null>(null);
```

```ts
  const openFile = useCallback(
    (path: string, anchor: string | null = null) => setOpenTarget({ path, anchor }),
    [],
  );
  const closeFile = useCallback(() => setOpenTarget(null), []);
```

3. Make the manifest fetch lang-aware (the existing effect at lines 72-88):

```ts
    fetch(`${apiBasePath}/kb?lang=${lang}`)
```

…and add `lang` to the dependency array: `}, [apiBasePath, lang]);`

4. Update the `value` memo to carry `citedRefs, setCitedRefs, openTarget` (and its dep array accordingly).

- [ ] **Step 5: Rewire `chat.tsx`**

1. Line 12: `import { extractCitations } from "@/lib/kb/cited-paths";` (replacing the `extractCitedPaths` import). Also add `import { citedRefKey } from "@/lib/kb/cited-paths";` (one combined import is fine).
2. Line 63: `const { setCitedRefs, citedRefs, openFile } = useKb();`
3. Replace the effect at lines 181-186:

```ts
  useEffect(() => {
    const assistantMessages = messages
      .filter((m) => m.role !== "user")
      .map((m) => ({ id: m.id, text: messageText(m) }));
    setCitedRefs(extractCitations(assistantMessages));
  }, [messages, setCitedRefs]);
```

4. Below it, derive the global numbering map:

```ts
  const citationIndices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of citedRefs) map[citedRefKey(r.path, r.anchor)] = r.index;
    return map;
  }, [citedRefs]);
```

(add `useMemo` to the react import if absent).
5. At the `<ChatMessage … onOpenArtifact={openFile} />` call site (~line 273), add `citationIndices={citationIndices}`. `openFile` already satisfies the new `(path, anchor)` signature.

- [ ] **Step 6: Rework `chat-message.tsx`**

1. Props (line 52): replace `onOpenArtifact?: (path: string) => void;` with:

```ts
  onOpenArtifact?: (path: string, anchor: string | null) => void;
  /** Conversation-global citation numbers keyed by `path` / `path#anchor`. */
  citationIndices?: Record<string, number>;
```

2. Replace `rewriteCitations` (lines 55-67):

```ts
function rewriteCitations(text: string, indices: Record<string, number>): string {
  const cites = parseCitations(text);
  let fallback = 0;
  let out = text;
  for (const c of cites) {
    fallback += 1;
    const key = c.anchor ? `${c.path}#${c.anchor}` : c.path;
    const n = indices[key] ?? fallback;
    const target = c.anchor ? `${c.path}#${c.anchor}` : c.path;
    // `kb://<path>[#anchor]` is an internal sentinel — the `a` renderer below
    // turns it into a button that opens the file (and section) in the KB panel.
    const replacement = `<sup>[\\[${n}\\]](kb://${target})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}
```

3. In the component body: destructure `citationIndices` and change line 79 to
   `const rendered = isAssistant ? rewriteCitations(text, citationIndices ?? {}) : text;`
4. In the `a` renderer (lines 144-156), parse the anchor:

```ts
                    a: ({ href, children }) => {
                      if (href?.startsWith("kb://")) {
                        const target = href.slice("kb://".length);
                        const hash = target.indexOf("#");
                        const path = hash === -1 ? target : target.slice(0, hash);
                        const anchor = hash === -1 ? null : target.slice(hash + 1);
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenArtifact?.(path, anchor)}
                            className="kb-citation"
                          >
                            {children}
                          </button>
                        );
                      }
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm vitest run tests/components/chat-message.test.tsx && pnpm typecheck`
Expected: chat-message tests PASS. Typecheck FAILS only in `components/kb/kb-panel.tsx` and `components/kb/kb-file-list.tsx` (they still reference `citedPaths`/`openFilePath`) — that is the next task's work. If anything else fails, fix it now.

- [ ] **Step 8: Commit**

```bash
git add lib/language.ts components/kb/kb-context.tsx components/chat.tsx components/chat-message.tsx tests/components/chat-message.test.tsx
git commit -m "feat(kb): anchor-aware citations end to end with conversation-global numbering"
```

(If `pnpm typecheck` failing on kb-panel blocks a pre-commit hook, commit with the panel temporarily adjusted in the same commit as Task 8 instead — do not ship a broken build.)

---

### Task 8: `KbTree` component, tree state hook, panel integration

**Files:**
- Create: `components/kb/use-kb-tree-state.ts`
- Create: `components/kb/kb-tree.tsx`
- Modify: `components/kb/kb-panel.tsx`
- Delete: `components/kb/kb-file-list.tsx`
- Modify: `app/globals.css` (append)

No DOM tests for these (repo practice: pure logic is unit-tested, component behavior is preview-verified in Task 10).

- [ ] **Step 1: Create the tree-state hook**

Create `components/kb/use-kb-tree-state.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import { citedRefKey, type CitedRef } from "@/lib/kb/cited-paths";
import { ancestorIdsFor, type KbTreeNode } from "@/lib/kb/tree";
import { anchorMatches } from "@/lib/kb/slug";

function readOverrides(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Expansion, filter, lens, and citation auto-reveal state for the KB tree.
 * Expansion is an override map (id → open?) on top of the default
 * "collections open, everything else closed". Overrides persist for the
 * session, and an explicit `false` blocks auto-reveal from re-opening a
 * branch the user closed.
 */
export function useKbTreeState({
  storageKey,
  files,
  citedRefs,
  groupNames,
}: {
  storageKey: string;
  files: KbFile[];
  citedRefs: CitedRef[];
  groupNames: ReadonlySet<string>;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
    readOverrides(storageKey),
  );
  const [filter, setFilter] = useState("");
  const [lens, setLens] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setOverrides(next);
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — state stays in memory */
      }
    },
    [storageKey],
  );

  const isExpanded = useCallback(
    (node: KbTreeNode) => overrides[node.id] ?? node.kind === "collection",
    [overrides],
  );

  const toggle = useCallback(
    (node: KbTreeNode) => persist({ ...overrides, [node.id]: !isExpanded(node) }),
    [overrides, isExpanded, persist],
  );

  // Auto-reveal: expand the path to a newly cited node once (never re-opening
  // a branch the user closed) and pulse the cited node.
  useEffect(() => {
    const fresh = citedRefs.filter((r) => !seen.current.has(citedRefKey(r.path, r.anchor)));
    if (fresh.length === 0) return;
    for (const r of fresh) seen.current.add(citedRefKey(r.path, r.anchor));

    const next = { ...overrides };
    let changed = false;
    let pulse: string | null = null;
    for (const r of fresh) {
      const file = files.find((f) => f.path === r.path);
      if (!file) continue;
      const ids = ancestorIdsFor(r.path, groupNames);
      for (const id of ids) {
        if (next[id] === false) continue;
        if (next[id] !== true) {
          next[id] = true;
          changed = true;
        }
      }
      const section = r.anchor
        ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug))
        : undefined;
      pulse = section ? `sec:${r.path}#${section.slug}` : `doc:${r.path}`;
    }
    if (changed) persist(next);
    if (pulse !== null) {
      setPulseId(pulse);
      const t = setTimeout(() => setPulseId(null), 1600);
      return () => clearTimeout(t);
    }
  }, [citedRefs, files, groupNames, overrides, persist]);

  return { isExpanded, toggle, filter, setFilter, lens, setLens, pulseId };
}
```

- [ ] **Step 2: Create the tree component**

Create `components/kb/kb-tree.tsx`. It owns: the filter/lens header row, pinned virtual rows (CV), the recursive tree, the empty states, and the keyboard handling. Visual language follows the existing panel (mono uppercase group labels, 13px doc titles, accent for citations):

```tsx
"use client";

import { useMemo, useRef } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { useKb } from "@/components/kb/kb-context";
import { useKbTreeState } from "@/components/kb/use-kb-tree-state";
import { buildKbTree, resolveGroups, type KbTreeNode } from "@/lib/kb/tree";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

function Chips({ chips }: { chips: number[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {chips.map((n) => (
        <span key={n} className="kb-chip">
          [{n}]
        </span>
      ))}
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0 transition-transform", open && "rotate-90")}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function KbTree({
  manifest,
  citedRefs,
  onOpen,
}: {
  manifest: KbFile[];
  citedRefs: CitedRef[];
  onOpen: (path: string, anchor?: string | null) => void;
}) {
  const { strings, lang, groups: configGroups, apiBasePath } = useKb();
  const filterRef = useRef<HTMLInputElement>(null);

  const pinned = manifest.filter((f) => f.path.startsWith("_virtual/"));
  const files = useMemo(() => manifest.filter((f) => !f.path.startsWith("_virtual/")), [manifest]);

  const groups = useMemo(
    () =>
      resolveGroups(
        configGroups,
        lang,
        strings.sections as Record<string, string | undefined>,
        strings.sections.other,
      ),
    [configGroups, lang, strings],
  );
  const groupNames = useMemo(
    () => new Set(groups.filter((g) => g.name !== "other").map((g) => g.name)),
    [groups],
  );

  const { isExpanded, toggle, filter, setFilter, lens, setLens, pulseId } = useKbTreeState({
    storageKey: `queritae:kbTree:${apiBasePath}`,
    files,
    citedRefs,
    groupNames,
  });

  const tree = useMemo(
    () => buildKbTree({ files, groups, citedRefs, filter, lens }),
    [files, groups, citedRefs, filter, lens],
  );

  // Filter/lens prune the tree small — render it fully expanded so matches
  // are visible without clicks. Normal mode uses the expansion overrides.
  const searchMode = filter.trim() !== "" || lens;

  if (manifest.length === 0) {
    return <p className="px-1 text-xs text-[var(--color-text-tertiary)]">{strings.unavailable}</p>;
  }

  function rowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, node: KbTreeNode) {
    const open = searchMode || isExpanded(node);
    if (e.key === "ArrowRight" && node.children.length > 0 && !open) {
      e.preventDefault();
      toggle(node);
    } else if (e.key === "ArrowLeft" && node.children.length > 0 && open && !searchMode) {
      e.preventDefault();
      toggle(node);
    }
  }

  function containerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "/" && document.activeElement !== filterRef.current) {
      e.preventDefault();
      filterRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-kb-row]"),
    );
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
    rows[next]?.focus();
    e.preventDefault();
  }

  function Row({ node, depth }: { node: KbTreeNode; depth: number }) {
    const open = searchMode || isExpanded(node);
    const container = node.kind === "collection" || node.kind === "folder";
    const expandable = node.children.length > 0;
    const cited = node.chips.length > 0;

    const onClick = () => {
      if (container || (node.kind === "doc" && !node.path)) {
        if (expandable) toggle(node);
        return;
      }
      if (node.kind === "doc") onOpen(node.path!, null);
      else onOpen(node.path!, node.anchor ?? null);
    };

    return (
      <>
        <div className="flex items-stretch" style={{ paddingLeft: depth * 14 }}>
          {node.kind === "doc" && expandable && (
            <button
              type="button"
              aria-label={open ? strings.collapseGroup : strings.expandGroup}
              onClick={() => toggle(node)}
              className="flex w-5 shrink-0 items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              disabled={searchMode}
            >
              <Chevron open={open} />
            </button>
          )}
          <button
            type="button"
            data-kb-row
            onClick={onClick}
            onKeyDown={(e) => rowKeyDown(e, node)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors",
              "hover:bg-[rgba(var(--color-primary-rgb),0.06)]",
              node.id === pulseId && "kb-pulse",
              cited && "bg-[rgba(var(--color-accent-rgb),0.06)]",
            )}
          >
            {container && <Chevron open={open} />}
            {node.kind === "section" && (
              <span aria-hidden className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                #
              </span>
            )}
            {container ? (
              <span className={LABEL} style={LABEL_STYLE}>
                {node.label}
              </span>
            ) : (
              <span
                className={cn(
                  "truncate text-[13px]",
                  node.kind === "section" && "text-[12px]",
                  cited
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)]",
                )}
              >
                {node.label}
              </span>
            )}
            {container && (
              <span className={LABEL} style={LABEL_STYLE}>
                {node.count}
              </span>
            )}
            {node.kind === "doc" && node.subtitle && (
              <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                {node.subtitle}
              </span>
            )}
            <Chips chips={node.chips} />
            {!open && node.dot && <Dot />}
            {node.kind === "doc" && (
              <span
                className="ml-1 shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.16em" }}
              >
                {node.fileType}
              </span>
            )}
          </button>
        </div>
        {open &&
          node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2" onKeyDown={containerKeyDown}>
      <div className="flex items-center gap-2">
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFilter("");
          }}
          placeholder={strings.filterPlaceholder}
          aria-label={strings.filterPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-hover)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setLens((v) => !v)}
          disabled={citedRefs.length === 0}
          aria-pressed={lens}
          aria-label={strings.referencedLensAria}
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase transition-colors",
            lens
              ? "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.10)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)]",
            citedRefs.length === 0 && "opacity-40",
          )}
          style={{ letterSpacing: "0.16em" }}
        >
          {strings.referencedLens} · {citedRefs.length}
        </button>
      </div>

      {pinned.length > 0 && !searchMode && (
        <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-2">
          {pinned.map((f) => (
            <button
              key={f.path}
              type="button"
              data-kb-row
              onClick={() => onOpen(f.path, null)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[rgba(var(--color-primary-rgb),0.06)]"
            >
              <span className="truncate">{f.title}</span>
              <span
                className="ml-auto shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.16em" }}
              >
                {f.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {tree.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-1 py-2">
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.noMatches}</p>
          {filter.trim() !== "" && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              {strings.clearFilter}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {tree.map((n) => (
            <Row key={n.id} node={n} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate in the panel and delete the file list**

Rewrite `components/kb/kb-panel.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { CV_VIRTUAL_PATH, useKb } from "@/components/kb/kb-context";
import { CvPanelView } from "@/components/cv/cv-panel-view";
import { KbTree } from "@/components/kb/kb-tree";
import { KbViewer } from "@/components/kb/kb-viewer";
import { breadcrumbFor, resolveGroups } from "@/lib/kb/tree";
import type { UiLang } from "@/lib/language";

/** Shared top-band style — matches the chat pane's status header height. */
const BAND = "flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4";

export function KbPanel({ onLangChange }: { onLangChange: (next: UiLang) => void }) {
  const { strings, lang, manifest, groups: configGroups, citedRefs, openTarget, openFile, closeFile } = useKb();

  const groups = useMemo(
    () =>
      resolveGroups(
        configGroups,
        lang,
        strings.sections as Record<string, string | undefined>,
        strings.sections.other,
      ),
    [configGroups, lang, strings],
  );

  // The synthesized CV doc isn't a real file — render the dedicated view.
  if (openTarget?.path === CV_VIRTUAL_PATH) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <CvPanelView onLangChange={onLangChange} />
      </aside>
    );
  }

  const openFileEntry = openTarget
    ? manifest.find((f) => f.path === openTarget.path) ?? null
    : null;

  // When a file is open, the viewer owns the whole pane — including its own
  // top band — so the panel renders nothing else around it.
  if (openFileEntry) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <KbViewer
          file={openFileEntry}
          anchor={openTarget!.anchor}
          citedRefs={citedRefs}
          breadcrumb={breadcrumbFor(openFileEntry.path, groups, strings.sections.other)}
          onBack={closeFile}
        />
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden">
      <div className={BAND}>
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          {strings.title}
        </span>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          {manifest.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {openTarget ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.notInKb}</p>
        ) : (
          <KbTree manifest={manifest} citedRefs={citedRefs} onOpen={openFile} />
        )}
      </div>
    </aside>
  );
}
```

Then delete the old list:

```bash
git rm components/kb/kb-file-list.tsx
```

(Task 9 updates `KbViewer`'s props; until then typecheck fails on the new `anchor`/`citedRefs`/`breadcrumb` props — Tasks 8 and 9 land as one commit if the pre-commit hook runs tsc, see Step 5.)

- [ ] **Step 4: Append tree CSS to `app/globals.css`**

```css
/* KB tree — citation chips and the auto-reveal pulse */
.kb-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-accent);
  letter-spacing: 0.04em;
}
.kb-pulse {
  animation: kb-flash 1.4s ease-out;
}
@keyframes kb-flash {
  0% {
    background-color: rgba(var(--color-accent-rgb), 0.22);
  }
  100% {
    background-color: transparent;
  }
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck`
Expected: errors ONLY about `KbViewer` not accepting `anchor`/`citedRefs`/`breadcrumb` (Task 9). If the repo's hooks block committing with type errors, do Task 9 first and commit both together; otherwise:

```bash
git add components/kb/use-kb-tree-state.ts components/kb/kb-tree.tsx components/kb/kb-panel.tsx app/globals.css
git commit -m "feat(kb): living-outline tree replaces the flat file list"
```

---

### Task 9: Viewer anchor navigation, cited markers, breadcrumb + outline

**Files:**
- Modify: `components/kb/kb-viewer.tsx`
- Modify: `components/kb/kb-doc-toolbar.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Extend the toolbar with breadcrumb + outline dropdown**

In `components/kb/kb-doc-toolbar.tsx`:

1. Extend the props:

```ts
export function KbDocToolbar({
  title,
  typeBadge,
  backLabel,
  onBack,
  actions,
  focused,
  onToggleFocus,
  expandLabel,
  minimizeLabel,
  breadcrumb,
  outline,
  onJumpTo,
  outlineLabel,
}: {
  title: string;
  typeBadge?: string;
  backLabel: string;
  onBack: () => void;
  actions: KbDocAction[];
  focused: boolean;
  onToggleFocus: () => void;
  expandLabel: string;
  minimizeLabel: string;
  /** Container labels shown muted before the title (collection, folders). */
  breadcrumb?: string[];
  /** Doc sections for the intra-doc jump dropdown; chip = citation index. */
  outline?: { slug: string; title: string; level: 2 | 3; chip?: number }[];
  onJumpTo?: (slug: string) => void;
  outlineLabel?: string;
}) {
```

2. Replace the title `<span>` (lines 53-55) with a breadcrumb + dropdown block:

```tsx
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <span className="hidden shrink-0 truncate text-[11px] text-[var(--color-text-tertiary)] sm:inline">
            {breadcrumb.join(" / ")}&nbsp;/
          </span>
        )}
        {outline && outline.length > 0 && onJumpTo ? (
          <OutlineTitle
            title={title}
            outline={outline}
            onJumpTo={onJumpTo}
            outlineLabel={outlineLabel ?? "Outline"}
          />
        ) : (
          <span className="min-w-0 truncate text-[13px] text-[var(--color-text-primary)]">
            {title}
          </span>
        )}
      </div>
```

3. Add the dropdown component at the bottom of the file (above the icons):

```tsx
function OutlineTitle({
  title,
  outline,
  onJumpTo,
  outlineLabel,
}: {
  title: string;
  outline: { slug: string; title: string; level: 2 | 3; chip?: number }[];
  onJumpTo: (slug: string) => void;
  outlineLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={outlineLabel}
        className="flex min-w-0 items-center gap-1 text-[13px] text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
      >
        <span className="min-w-0 truncate">{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {outline.map((s) => (
            <button
              key={s.slug}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onJumpTo(s.slug);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[rgba(var(--color-primary-rgb),0.08)] hover:text-[var(--color-text-primary)]"
              style={{ paddingLeft: s.level === 3 ? 20 : 8 }}
            >
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              {s.chip !== undefined && <span className="kb-chip">[{s.chip}]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extend the viewer**

In `components/kb/kb-viewer.tsx`:

1. New imports and props:

```ts
import type { ReactNode } from "react";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { anchorMatches, slugify } from "@/lib/kb/slug";
```

```ts
export function KbViewer({
  file,
  anchor = null,
  citedRefs = [],
  breadcrumb = [],
  onBack,
}: {
  file: KbFile;
  anchor?: string | null;
  citedRefs?: CitedRef[];
  breadcrumb?: string[];
  onBack: () => void;
}) {
```

2. Inside the component, derive cited-section chips (first index per section):

```ts
  const sectionChips = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of citedRefs) {
      if (r.path !== file.path || !r.anchor) continue;
      const sec = file.sections?.find((s) => anchorMatches(r.anchor!, s.slug));
      if (sec && !map.has(sec.slug)) map.set(sec.slug, r.index);
    }
    return map;
  }, [citedRefs, file]);
```

3. Add the jump/flash helper and the open-at-anchor effect (after the text-fetch effect):

```ts
  function jumpTo(slug: string) {
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("kb-flash-target");
    setTimeout(() => el.classList.remove("kb-flash-target"), 1600);
  }

  // Opening from a citation: once the markdown is on screen, scroll to the
  // cited section and flash it. Unmatched anchors degrade to the top.
  useEffect(() => {
    if (!anchor || file.type !== "md" || text === null) return;
    const target = file.sections?.find((s) => anchorMatches(anchor, s.slug));
    if (!target) return;
    // Next frame: ReactMarkdown has committed the headings by then.
    const raf = requestAnimationFrame(() => jumpTo(target.slug));
    return () => cancelAnimationFrame(raf);
  }, [anchor, file, text]);
```

4. Heading renderers with stable ids and persistent cited markers. Add above the component:

```ts
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}
```

…and inside the component, a memoized components map:

```tsx
  // Heading ids come from the shared slugger so citation anchors, manifest
  // sections, and DOM ids all agree. Duplicate headings share one id (the
  // first wins on jump) — extractSections' -1 suffixes are a tree-only
  // disambiguation, acceptable degradation for in-page jumps.
  const mdComponents = useMemo(() => {
    const heading = (Tag: "h2" | "h3") =>
      function Heading({ children }: { children?: ReactNode }) {
        const slug = slugify(textOf(children));
        const chip = sectionChips.get(slug);
        return (
          <Tag id={slug || undefined} className={chip !== undefined ? "kb-cited-section" : undefined}>
            {children}
            {chip !== undefined && <span className="kb-chip"> [{chip}]</span>}
          </Tag>
        );
      };
    return { h2: heading("h2"), h3: heading("h3") };
  }, [sectionChips]);
```

5. Wire it into the markdown render (line 168-173):

```tsx
        {file.type === "md" && text !== null && (
          <div className="prose-chat">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={mdComponents}
            >
              {stripFrontmatter(text)}
            </ReactMarkdown>
          </div>
        )}
```

6. Extend the toolbar call (lines 147-157):

```tsx
      <KbDocToolbar
        title={file.title}
        typeBadge={file.type}
        backLabel={strings.back}
        onBack={onBack}
        actions={actions}
        focused={focus}
        onToggleFocus={() => setFocus((v) => !v)}
        expandLabel={strings.expandFocus}
        minimizeLabel={strings.exitFocus}
        breadcrumb={breadcrumb}
        outline={file.sections?.map((s) => ({ ...s, chip: sectionChips.get(s.slug) }))}
        onJumpTo={jumpTo}
        outlineLabel={strings.outline}
      />
```

**Sanitizer note:** `rehype-sanitize`'s default schema strips `id` attributes except where allowlisted. If heading ids disappear (verify in Step 4), extend the schema in `kb-viewer.tsx`:

```ts
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const viewerSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h2: [...((defaultSchema.attributes?.h2 as unknown[]) ?? []), "id", "className"],
    h3: [...((defaultSchema.attributes?.h3 as unknown[]) ?? []), "id", "className"],
  },
};
```

…and pass `[rehypeSanitize, viewerSanitizeSchema]`. (React components add the id AFTER sanitization runs on the hast, so this is likely unnecessary — components replace elements at render time. Verify rather than assume.)

- [ ] **Step 3: Append viewer CSS to `app/globals.css`**

```css
/* KB viewer — cited-section markers and the jump flash */
.prose-chat .kb-cited-section {
  border-left: 2px solid rgba(var(--color-accent-rgb), 0.5);
  padding-left: 0.625rem;
  margin-left: -0.75rem;
}
.kb-flash-target {
  animation: kb-flash 1.4s ease-out;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean typecheck, full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-viewer.tsx components/kb/kb-doc-toolbar.tsx app/globals.css
git commit -m "feat(kb): viewer anchor navigation, cited-section markers, breadcrumb outline"
```

---

### Task 10: Final sweep and live verification

**Files:** none new — verification and cleanup.

- [ ] **Step 1: Dead-reference sweep**

Run:

```bash
grep -rn "citedPaths\|openFilePath\|KbFileList\|extractCitedPaths" --include="*.ts" --include="*.tsx" app components lib tests
```

Expected: `extractCitedPaths` hits only in `lib/kb/cited-paths.ts`, its test, and `lib/admin/analytics*` (a legitimate consumer — leave it). No hits for `citedPaths`, `openFilePath`, or `KbFileList` anywhere. Fix any stragglers.

- [ ] **Step 2: Full gate**

Run: `pnpm typecheck && pnpm test`
Expected: both clean.

- [ ] **Step 3: Live verification (preview tools)**

1. Start the dev server (preview_start).
2. Open the account chat page; confirm the KB panel shows the tree: collections expanded with counts, docs collapsed, CV pinned on top.
3. Expand a doc with headings → section rows appear; click a section → viewer opens scrolled to the flashed heading, breadcrumb shows `Collection / title`, outline dropdown jumps between sections.
4. Type in the filter → tree prunes and renders expanded; Escape clears; nonsense input shows the no-matches state with a working clear action.
5. Ask the agent something that cites the KB → superscript `[n]` appears; the tree auto-expands to the cited node with a chip pulse; collapsed ancestors show dots after manual collapse; the lens toggle shows only cited branches; clicking the superscript opens the doc at the cited section with the persistent left-border marker.
6. Switch language to fr → tree labels and section titles follow the locale.
7. Check preview_console_logs for errors; screenshot the panel for the final report.

- [ ] **Step 4: Final commit (if verification produced fixes)**

```bash
git add -A && git commit -m "fix(kb): living-outline polish from live verification"
```

---

## Spec coverage map

| Spec requirement | Task |
|---|---|
| Shared slugger, normalized anchor matching | 1 |
| h2/h3 extraction, fences ignored, dup suffixes | 2 |
| `KbFile.sections`, locale-resolved extraction | 3 |
| `lang` param, `(account, lang)` cache | 4 |
| `CitedRef` extraction, footnote indices | 5 |
| Tree build: groups order, nesting, `other`, chips, dots, filter, lens, breadcrumb | 6 |
| Context `citedRefs`/`openTarget`, `kb://path#anchor`, global numbering | 7 |
| Tree UI: expansion persistence, auto-reveal, lens toggle, filter UX, keyboard, pinned CV, empty states | 8 |
| Viewer: scroll+flash, persistent markers, breadcrumb, outline dropdown | 9 |
| Edge cases (unknown path ignored at build; unmatched anchor → doc chip → top of doc; no headings → no chevron via `children.length`) | 5, 6, 9 |
| Out of scope: virtualization, YAML outlining, pins, trail view | (none — excluded) |

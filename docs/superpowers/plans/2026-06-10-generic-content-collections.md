# Generic Content Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the content KB agnostic of "resume" content — a repo-declared `content.config.yaml` drives a generic loader/assembler/sync-gate/UI grouping, with the current resume layout as the default preset so existing content repos work byte-for-byte unchanged.

**Architecture:** Two layers. The **engine** loads a list of *collection descriptors* (name, kind yaml|markdown, schema key, sort, required, label) into a `LoadedContent` map, assembles it into the agent prompt text, derives the sync gate's required-file list, and tells the UI which directory groups exist. The **resume preset** packages today's 8 shapes (profile, skills, education, public-contact, experience, projects, talks, recommendations) as descriptors with their exact current schemas, sorts, and renderers — applied whenever a content repo ships no `content.config.yaml`. Typed surfaces (CV, forward-question email) consume a `toResumeKb()` projection of the engine output. Future FYI: the chat-page KB view will become an interactive document treeview, so the manifest API now returns ordered group metadata alongside the flat file list.

**Tech Stack:** Next.js (App Router), TypeScript, Zod 4, gray-matter, yaml, Vitest.

**Critical invariant:** For a content repo *without* `content.config.yaml`, the assembled KB text must be **byte-identical** to today's output (prompt-cache stability). Task 5 has an explicit equality test for this.

**Out of scope (explicitly deferred):**
- Inline schema definitions in `content.config.yaml` (only preset names + `generic` in v1).
- Locales beyond `en`/`fr` (the app shell only ships those UI strings; config can narrow to `[en]`).
- The interactive treeview itself (this plan only makes the manifest/groups API ready for it).
- CV remains coupled to the resume preset by design — it's a resume view.

**Verification commands** (used throughout):
- Single test file: `pnpm vitest run tests/lib/kb/content-config.test.ts`
- Full suite: `pnpm test`
- Types: `pnpm typecheck`

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `lib/kb/schemas.ts` | Modify | + `GenericRecordSchema` (permissive frontmatter/yaml shape) |
| `lib/kb/content-config.ts` | Create | Config file schema, sync loader, `resolveContentConfig`, `RESUME_PRESET`, `SCHEMA_REGISTRY`, `kbGroups` |
| `lib/kb/meta-format.ts` | Modify | + `humanizeSlug`, + `KbGroup` type (client-safe home), + `date` subtitle fallback |
| `lib/kb/loader.ts` | Modify | Generic `loadCollections`/`loadContent`/`toResumeKb`; `loadKb` becomes a preset adapter |
| `lib/kb/assembler.ts` | Modify | Renderers take data (not `Kb`); + `assembleContentText` + generic renderers |
| `lib/kb/manifest.ts` | Modify | Use shared `humanizeSlug`; pick `date` into `KbFileMeta` |
| `lib/persona-source.ts` | Modify | `requiredPersonaFiles(config)` replaces the hardcoded const; `validatePersonaTree` is config-aware |
| `lib/kb/cache.ts` | Modify | Cache `LoadedContent` per (account, lang); derive `Kb` + text from it |
| `lib/kb/handlers.ts` | Modify | Manifest response gains `groups` |
| `lib/cv/load.ts` | Modify | `loadContent` + `toResumeKb` (config-aware) |
| `app/about/page.tsx` | Modify | Engine path |
| `scripts/eval.ts` | Modify | Engine path |
| `scripts/validate-kb.ts` | Modify | Engine path, dynamic per-collection counts |
| `components/kb/kb-context.tsx` | Modify | Fetch + expose `groups` |
| `components/kb/kb-file-list.tsx` | Modify | Dynamic groups instead of hardcoded `GROUP_ORDER` |
| `tests/fixtures/content-custom/` | Create | Full persona root with `content.config.yaml`, custom `notes/` + `glossary.yaml` collections |
| `tests/lib/kb/content-config.test.ts` | Create | Config parsing/resolution tests |
| `tests/lib/kb/loader-generic.test.ts` | Create | Engine loader tests |
| `tests/lib/kb/assembler-generic.test.ts` | Create | Byte-stability + generic render tests |
| `tests/lib/persona-source-required.test.ts` | Create | Sync-gate tests |
| `docs/content-repo-guide.md` | Modify | New §"Custom collections" |

Existing tests in `tests/lib/kb/*` and `tests/lib/persona-source.test.ts` must stay green (one possible message-order expectation update in Task 6, called out there).

---

### Task 1: Generic schema + `content.config.yaml` module

**Files:**
- Modify: `lib/kb/schemas.ts` (append at end)
- Create: `lib/kb/content-config.ts`
- Modify: `lib/kb/meta-format.ts` (add `KbGroup` + `humanizeSlug`)
- Test: `tests/lib/kb/content-config.test.ts`

- [ ] **Step 1: Add `GenericRecordSchema` to `lib/kb/schemas.ts`**

Append at the end of the file:

```ts
/**
 * Permissive shape for config-declared generic collections: any YAML mapping /
 * markdown frontmatter object. Views render only scalar keys; validation here
 * just guarantees "it is an object".
 */
export const GenericRecordSchema = z.record(z.string(), z.unknown());
export type GenericRecord = z.infer<typeof GenericRecordSchema>;
```

- [ ] **Step 2: Add `KbGroup` and `humanizeSlug` to `lib/kb/meta-format.ts`**

This module is already client-safe (imported by `components/kb/kb-file-list.tsx`), which is why the shared type and helper live here and not in a node-only module. Append at the end:

```ts
/** A directory group of the KB panel, in display order. Derived server-side
 * from the content config's markdown collections. */
export type KbGroup = {
  name: string;
  label?: { en: string; fr?: string };
};

/** Humanizes a kebab/snake slug into a display label ("public-notes" → "Public notes"). */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/lib/kb/content-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  loadContentConfig,
  resolveContentConfig,
  RESUME_PRESET,
  kbGroups,
} from "@/lib/kb/content-config";

function writeConfig(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "content-config-"));
  writeFileSync(path.join(dir, "content.config.yaml"), yaml);
  return dir;
}

const CORE = `
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
`;

describe("loadContentConfig", () => {
  it("returns null when content.config.yaml is absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "content-config-"));
    expect(loadContentConfig(dir)).toBeNull();
  });

  it("parses a valid config", () => {
    const dir = writeConfig(`
locales: [en]
collections:
${CORE}
  - name: notes
    kind: markdown
    label: { en: Notes }
    sort: { field: date, order: desc }
`);
    const config = loadContentConfig(dir);
    expect(config).not.toBeNull();
    expect(config!.locales).toEqual(["en"]);
    expect(config!.collections).toHaveLength(3);
  });

  it("throws a clear error on invalid YAML", () => {
    const dir = writeConfig("collections: [unclosed");
    expect(() => loadContentConfig(dir)).toThrow(/content\.config\.yaml/);
  });

  it("rejects required: true on a markdown collection", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
    required: true
`);
    expect(() => loadContentConfig(dir)).toThrow(/required/);
  });
});

describe("resolveContentConfig", () => {
  it("returns the resume preset for a null config", () => {
    expect(resolveContentConfig(null)).toBe(RESUME_PRESET);
  });

  it("defaults locales to [en, fr] and schema to generic", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
`);
    const resolved = resolveContentConfig(loadContentConfig(dir));
    expect(resolved.locales).toEqual(["en", "fr"]);
    const notes = resolved.collections.find((c) => c.name === "notes")!;
    expect(notes.schemaKey).toBe("generic");
  });

  it("applies the preset default sort when a preset schema is reused", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: gigs
    kind: markdown
    schema: experience
`);
    const resolved = resolveContentConfig(loadContentConfig(dir));
    const gigs = resolved.collections.find((c) => c.name === "gigs")!;
    expect(gigs.sort).toEqual({ field: "start", order: "desc" });
  });

  it("rejects a config without the profile collection", () => {
    const dir = writeConfig(`
collections:
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: notes
    kind: markdown
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/profile/);
  });

  it("rejects a yaml collection with a markdown-only schema", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: jobs
    kind: yaml
    schema: experience
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/schema/);
  });

  it("rejects duplicate collection names", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
  - name: notes
    kind: markdown
`);
    expect(() => resolveContentConfig(loadContentConfig(dir))).toThrow(/duplicate/);
  });
});

describe("RESUME_PRESET", () => {
  it("declares the 8 legacy collections in assembly order", () => {
    expect(RESUME_PRESET.collections.map((c) => c.name)).toEqual([
      "profile", "skills", "education", "public-contact",
      "experience", "projects", "talks", "recommendations",
    ]);
    expect(RESUME_PRESET.locales).toEqual(["en", "fr"]);
  });
});

describe("kbGroups", () => {
  it("returns markdown collections in order, with labels when configured", () => {
    const dir = writeConfig(`
collections:
${CORE}
  - name: notes
    kind: markdown
    label: { en: Notes, fr: Notes }
  - name: glossary
    kind: yaml
`);
    const groups = kbGroups(resolveContentConfig(loadContentConfig(dir)));
    expect(groups).toEqual([{ name: "notes", label: { en: "Notes", fr: "Notes" } }]);
  });

  it("matches the legacy GROUP_ORDER for the resume preset", () => {
    expect(kbGroups(RESUME_PRESET).map((g) => g.name)).toEqual([
      "experience", "projects", "talks", "recommendations",
    ]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/content-config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/kb/content-config'` (or equivalent resolve error).

- [ ] **Step 5: Create `lib/kb/content-config.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RecommendationFrontmatterSchema,
  GenericRecordSchema,
} from "./schemas";
import type { KbGroup } from "./meta-format";

/**
 * Registry of named schemas a `content.config.yaml` collection may reference.
 * Resume shapes are presets; `generic` accepts any YAML mapping / frontmatter.
 */
export const SCHEMA_REGISTRY = {
  profile: ProfileSchema,
  skills: SkillsSchema,
  education: EducationSchema,
  "public-contact": PublicContactSchema,
  experience: ExperienceFrontmatterSchema,
  project: ProjectFrontmatterSchema,
  talk: TalkFrontmatterSchema,
  recommendation: RecommendationFrontmatterSchema,
  generic: GenericRecordSchema,
} as const;
export type SchemaKey = keyof typeof SCHEMA_REGISTRY;

const SCHEMA_KEYS = Object.keys(SCHEMA_REGISTRY) as [SchemaKey, ...SchemaKey[]];

/** Which schemas fit which collection kind. `generic` fits both. */
const YAML_SCHEMAS: ReadonlySet<SchemaKey> = new Set(["profile", "skills", "education", "public-contact", "generic"]);
const MARKDOWN_SCHEMAS: ReadonlySet<SchemaKey> = new Set(["experience", "project", "talk", "recommendation", "generic"]);

const LabelSchema = z.object({ en: z.string().min(1), fr: z.string().min(1).optional() });
const SortSchema = z.object({
  field: z.string().min(1),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const CollectionConfigSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "collection name must be kebab-case"),
    kind: z.enum(["yaml", "markdown"]),
    label: LabelSchema.optional(),
    schema: z.enum(SCHEMA_KEYS).optional(),
    required: z.boolean().default(false),
    sort: SortSchema.optional(),
  })
  .strict()
  .refine((c) => !(c.kind === "markdown" && c.required), {
    message: "required: true is only valid for yaml collections (markdown directories may be empty or absent)",
  });

export const ContentConfigSchema = z
  .object({
    /** Declared content locales; the FIRST is canonical (bare filename). */
    locales: z.array(z.enum(["en", "fr"])).nonempty().default(["en", "fr"]),
    collections: z.array(CollectionConfigSchema).min(1),
  })
  .strict();
export type ContentConfig = z.infer<typeof ContentConfigSchema>;

export type ResolvedCollection = {
  name: string;
  kind: "yaml" | "markdown";
  schemaKey: SchemaKey;
  label?: { en: string; fr?: string };
  required: boolean;
  sort?: { field: string; order: "asc" | "desc" };
};

export type ResolvedContentConfig = {
  /** First locale is canonical (bare filename, no suffix). */
  locales: ("en" | "fr")[];
  collections: ResolvedCollection[];
};

/** Default per-schema sort for markdown presets — matches the legacy loadKb
 * sort rules exactly (byte-stability of the assembled KB text depends on it). */
const PRESET_DEFAULT_SORT: Partial<Record<SchemaKey, { field: string; order: "asc" | "desc" }>> = {
  experience: { field: "start", order: "desc" },
  project: { field: "year", order: "desc" },
  talk: { field: "year", order: "desc" },
  recommendation: { field: "date", order: "desc" },
};

/** The legacy resume layout, applied when a repo ships no content.config.yaml.
 * Collection order IS assembly order — do not reorder. */
export const RESUME_PRESET: ResolvedContentConfig = {
  locales: ["en", "fr"],
  collections: [
    { name: "profile", kind: "yaml", schemaKey: "profile", required: true },
    { name: "skills", kind: "yaml", schemaKey: "skills", required: true },
    { name: "education", kind: "yaml", schemaKey: "education", required: true },
    { name: "public-contact", kind: "yaml", schemaKey: "public-contact", required: true },
    { name: "experience", kind: "markdown", schemaKey: "experience", required: false, sort: PRESET_DEFAULT_SORT.experience },
    { name: "projects", kind: "markdown", schemaKey: "project", required: false, sort: PRESET_DEFAULT_SORT.project },
    { name: "talks", kind: "markdown", schemaKey: "talk", required: false, sort: PRESET_DEFAULT_SORT.talk },
    { name: "recommendations", kind: "markdown", schemaKey: "recommendation", required: false, sort: PRESET_DEFAULT_SORT.recommendation },
  ],
};

/**
 * Reads `content.config.yaml` at the persona root. Absent file → null (the
 * resume preset applies). Malformed YAML or schema → throws with a message
 * that names the file, so sync errors are actionable.
 */
export function loadContentConfig(rootDir: string): ContentConfig | null {
  const file = path.join(rootDir, "content.config.yaml");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`content.config.yaml: invalid YAML: ${(err as Error).message}`);
  }
  try {
    return ContentConfigSchema.parse(parsed);
  } catch (err) {
    throw new Error(`content.config.yaml: ${(err as Error).message}`);
  }
}

/**
 * Turns a parsed config into the resolved descriptor list the engine runs on.
 * `null` → the resume preset. Enforces: unique names, schema/kind affinity,
 * and the presence of the `profile` + `public-contact` yaml collections (the
 * app shell — page header, CV title, forward-question email — depends on them).
 */
export function resolveContentConfig(config: ContentConfig | null): ResolvedContentConfig {
  if (config === null) return RESUME_PRESET;
  const names = new Set<string>();
  const collections: ResolvedCollection[] = config.collections.map((c) => {
    if (names.has(c.name)) {
      throw new Error(`content.config.yaml: duplicate collection name "${c.name}"`);
    }
    names.add(c.name);
    const schemaKey: SchemaKey = c.schema ?? "generic";
    const allowed = c.kind === "yaml" ? YAML_SCHEMAS : MARKDOWN_SCHEMAS;
    if (!allowed.has(schemaKey)) {
      throw new Error(
        `content.config.yaml: collection "${c.name}" — schema "${schemaKey}" cannot be used with kind "${c.kind}"`,
      );
    }
    return {
      name: c.name,
      kind: c.kind,
      schemaKey,
      label: c.label,
      required: c.required,
      sort: c.sort ?? (c.kind === "markdown" ? PRESET_DEFAULT_SORT[schemaKey] : undefined),
    };
  });
  for (const must of ["profile", "public-contact"] as const) {
    const col = collections.find((c) => c.name === must);
    if (!col || col.kind !== "yaml" || col.schemaKey !== must) {
      throw new Error(
        `content.config.yaml: a yaml collection "${must}" with schema "${must}" is required (the app shell depends on it)`,
      );
    }
  }
  return { locales: config.locales, collections };
}

/** The KB panel's directory groups: markdown collections in config order. */
export function kbGroups(config: ResolvedContentConfig): KbGroup[] {
  return config.collections
    .filter((c) => c.kind === "markdown")
    .map((c) => (c.label ? { name: c.name, label: c.label } : { name: c.name }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/kb/content-config.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Run existing KB tests + typecheck (no regressions)**

Run: `pnpm vitest run tests/lib/kb && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/kb/schemas.ts lib/kb/content-config.ts lib/kb/meta-format.ts tests/lib/kb/content-config.test.ts
git commit -m "feat(kb): content.config.yaml collection registry with resume preset"
```

---

### Task 2: Custom-collection test fixture

A full persona root exercising the config path: English-only locales, two custom collections (`notes/` markdown, `glossary.yaml` yaml), plus the mandatory profile/public-contact.

**Files:**
- Create: `tests/fixtures/content-custom/content.config.yaml`
- Create: `tests/fixtures/content-custom/persona.yaml`
- Create: `tests/fixtures/content-custom/prompts/system.md`
- Create: `tests/fixtures/content-custom/kb/profile.yaml`
- Create: `tests/fixtures/content-custom/kb/public-contact.yaml`
- Create: `tests/fixtures/content-custom/kb/glossary.yaml`
- Create: `tests/fixtures/content-custom/kb/notes/2026-01-first-note.md`
- Create: `tests/fixtures/content-custom/kb/notes/2026-03-second-note.md`

- [ ] **Step 1: Create the fixture files**

`tests/fixtures/content-custom/content.config.yaml`:

```yaml
locales: [en]
collections:
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: notes
    kind: markdown
    label: { en: Notes, fr: Notes }
    sort: { field: date, order: desc }
  - name: glossary
    kind: yaml
    label: { en: Glossary }
```

`tests/fixtures/content-custom/persona.yaml` (copy the shape of `tests/fixtures/persona/persona.yaml` — read it first and reuse its exact structure, changing only the names):

```yaml
id: custom-subject
fullName: "Custom Subject"
givenName: "Custom"
defaultLocale: en
i18n:
  en:
    possessive: "their"
    objectPronoun: "them"
    subjectPronoun: "they"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "de Custom"
```

`tests/fixtures/content-custom/prompts/system.md`:

```markdown
# System prompt — Custom Subject's agent

You answer questions about the Custom Subject corpus. Cite every claim with
`[^kb:<path>]`.
```

`tests/fixtures/content-custom/kb/profile.yaml`:

```yaml
name: Custom Subject
headline: A corpus that is not a resume
```

`tests/fixtures/content-custom/kb/public-contact.yaml`:

```yaml
email: corpus@example.com
```

`tests/fixtures/content-custom/kb/glossary.yaml`:

```yaml
terms:
  - term: widget
    definition: A reusable unit of interface.
  - term: gadget
    definition: A widget with opinions.
```

`tests/fixtures/content-custom/kb/notes/2026-01-first-note.md`:

```markdown
---
title: First note
date: "2026-01"
tags: [alpha, beta]
---

The first note's body.
```

`tests/fixtures/content-custom/kb/notes/2026-03-second-note.md`:

```markdown
---
title: Second note
date: "2026-03"
---

The second note's body.
```

- [ ] **Step 2: Sanity-check the fixture parses**

Run: `pnpm vitest run tests/lib/kb/content-config.test.ts`
Expected: PASS (fixture isn't covered yet — this just confirms nothing broke).

Then verify the fixture config loads, with a quick inline script:

```bash
pnpm tsx -e "
import { loadContentConfig, resolveContentConfig } from './lib/kb/content-config';
const c = resolveContentConfig(loadContentConfig('tests/fixtures/content-custom'));
console.log(c.collections.map((x) => x.name).join(','));
"
```

Expected output: `profile,public-contact,notes,glossary`

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/content-custom
git commit -m "test(kb): custom-collection persona fixture"
```

---

### Task 3: Generic loader engine

`loadCollections` (engine), `loadContent` (root entry point), `toResumeKb` (typed projection), `loadKb` re-implemented as a preset adapter. All existing exported types keep their names and shapes.

**Files:**
- Modify: `lib/kb/loader.ts` (full rewrite below)
- Test: `tests/lib/kb/loader-generic.test.ts` (new)
- Existing test must stay green: `tests/lib/kb/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/loader-generic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadContent, loadKb, toResumeKb } from "@/lib/kb/loader";

const CUSTOM_ROOT = path.join(__dirname, "../../fixtures/content-custom");
const PERSONA_ROOT = path.join(__dirname, "../../fixtures/persona");

describe("loadContent (custom config)", () => {
  it("loads config-declared collections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    expect([...content.collections.keys()].sort()).toEqual(
      ["glossary", "notes", "profile", "public-contact"],
    );
  });

  it("sorts a generic markdown collection by the configured field", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const notes = content.collections.get("notes")!;
    if (notes.kind !== "markdown") throw new Error("expected markdown collection");
    expect(notes.entries.map((e) => e.slug)).toEqual([
      "2026-03-second-note",
      "2026-01-first-note",
    ]);
  });

  it("keeps raw text for generic yaml collections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const glossary = content.collections.get("glossary")!;
    if (glossary.kind !== "yaml") throw new Error("expected yaml collection");
    expect(glossary.raw).toContain("term: widget");
    expect(glossary.relativePath).toBe("glossary.yaml");
  });

  it("projects to a resume Kb with empty defaults for absent sections", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const kb = toResumeKb(content);
    expect(kb.profile.name).toBe("Custom Subject");
    expect(kb.publicContact.email).toBe("corpus@example.com");
    expect(kb.skills.skills).toEqual([]);
    expect(kb.education.entries).toEqual([]);
    expect(kb.experience).toEqual([]);
  });
});

describe("loadContent (no config → resume preset)", () => {
  it("matches loadKb output for the persona fixture", async () => {
    const content = await loadContent(PERSONA_ROOT);
    const viaEngine = toResumeKb(content);
    const viaLegacy = await loadKb(path.join(PERSONA_ROOT, "kb"));
    expect(viaEngine).toEqual(viaLegacy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/loader-generic.test.ts`
Expected: FAIL — `loadContent` / `toResumeKb` are not exported.

- [ ] **Step 3: Rewrite `lib/kb/loader.ts`**

Replace the whole file with:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import {
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type RecommendationFrontmatter,
} from "./schemas";
import {
  SCHEMA_REGISTRY,
  RESUME_PRESET,
  loadContentConfig,
  resolveContentConfig,
  type ResolvedCollection,
  type ResolvedContentConfig,
} from "./content-config";

export type KbLang = "en" | "fr";

/** One markdown entry of any collection. `F` narrows the frontmatter for the
 * resume preset projections below. */
export type GenericEntry<F = Record<string, unknown>> = {
  slug: string;
  relativePath: string;
  frontmatter: F;
  body: string;
};

export type ExperienceEntry = GenericEntry<ExperienceFrontmatter>;
export type ProjectEntry = GenericEntry<ProjectFrontmatter>;
export type TalkEntry = GenericEntry<TalkFrontmatter>;
export type RecommendationEntry = GenericEntry<RecommendationFrontmatter>;

export type LoadedCollection =
  | { kind: "markdown"; config: ResolvedCollection; entries: GenericEntry[] }
  | { kind: "yaml"; config: ResolvedCollection; relativePath: string; data: unknown; raw: string };

export type LoadedContent = {
  config: ResolvedContentConfig;
  lang: KbLang;
  collections: Map<string, LoadedCollection>;
};

/** The typed resume projection consumed by the CV and other resume surfaces. */
export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  talks: TalkEntry[];
  recommendations: RecommendationEntry[];
};

/**
 * Resolves a KB file path to its localized variant when one exists, else
 * falls back to the canonical English file. `base` is the path WITHOUT the
 * extension (e.g. `kb/experience/2024-fixture-co` for an `.md` file, or
 * `kb/profile` for a `.yaml` file).
 */
async function pickFile(base: string, ext: string, lang: KbLang): Promise<string> {
  if (lang !== "en") {
    const localized = `${base}.${lang}.${ext}`;
    try {
      await fs.access(localized);
      return localized;
    } catch {
      /* sidecar missing — fall through */
    }
  }
  return `${base}.${ext}`;
}

async function readYamlCollection(
  kbDir: string,
  col: ResolvedCollection,
  lang: KbLang,
): Promise<LoadedCollection | null> {
  const file = await pickFile(path.join(kbDir, col.name), "yaml", lang);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if (!col.required) return null;
    throw new Error(`KB: failed to read ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`KB: failed to parse YAML in ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  let data: unknown;
  try {
    data = SCHEMA_REGISTRY[col.schemaKey].parse(parsed);
  } catch (err) {
    throw new Error(`KB: schema validation failed for ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  return { kind: "yaml", config: col, relativePath: `${col.name}.yaml`, data, raw };
}

async function readMarkdownDir(
  dir: string,
  schema: { parse: (v: unknown) => unknown },
  label: string,
  lang: KbLang,
): Promise<GenericEntry[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  // Filter out localized sidecars at directory listing — we resolve them via
  // pickFile per canonical entry below.
  const md = files
    .filter((f) => f.endsWith(".md") && !/\.[a-z]{2}\.md$/.test(f))
    .sort();
  const out: GenericEntry[] = [];
  for (const file of md) {
    const canonicalRel = `${path.basename(dir)}/${file}`;
    const base = path.join(dir, file.replace(/\.md$/, ""));
    const actual = await pickFile(base, "md", lang);
    let raw: string;
    try {
      raw = await fs.readFile(actual, "utf8");
    } catch (err) {
      throw new Error(`KB: failed to read ${label} (${actual}): ${(err as Error).message}`);
    }
    const parsed = matter(raw);
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = schema.parse(parsed.data) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`KB: frontmatter validation failed for ${label} ${file}: ${(err as Error).message}`);
    }
    out.push({
      slug: file.replace(/\.md$/, ""),
      // CANONICAL path — citations cite this regardless of which variant we
      // actually read, so citation tokens stay stable across languages.
      relativePath: canonicalRel,
      frontmatter,
      body: parsed.content.trim(),
    });
  }
  return out;
}

/** Comparable sort key: `"present"` maps high so open-ended ranges sort first
 * under desc (matches the legacy experience sort). */
function sortValue(v: unknown): string | number | undefined {
  if (v === "present") return "9999-99";
  if (typeof v === "string" || typeof v === "number") return v;
  return undefined;
}

function compareEntries(field: string, order: "asc" | "desc") {
  const dir = order === "asc" ? 1 : -1;
  return (a: GenericEntry, b: GenericEntry): number => {
    const av = sortValue(a.frontmatter[field]);
    const bv = sortValue(b.frontmatter[field]);
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1; // missing sorts last either way
    if (bv === undefined) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  };
}

/** Loads every collection a config declares from `kbDir`. Optional yaml
 * collections whose file is absent are omitted from the map; markdown
 * collections with an absent directory load as empty. */
export async function loadCollections(
  kbDir: string,
  lang: KbLang,
  config: ResolvedContentConfig,
): Promise<Map<string, LoadedCollection>> {
  const stat = await fs.stat(kbDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`KB: root directory does not exist: ${kbDir}`);
  }
  const loaded = await Promise.all(
    config.collections.map(async (col): Promise<[string, LoadedCollection] | null> => {
      if (col.kind === "yaml") {
        const c = await readYamlCollection(kbDir, col, lang);
        return c ? [col.name, c] : null;
      }
      const entries = await readMarkdownDir(
        path.join(kbDir, col.name),
        SCHEMA_REGISTRY[col.schemaKey],
        col.name,
        lang,
      );
      if (col.sort) entries.sort(compareEntries(col.sort.field, col.sort.order));
      return [col.name, { kind: "markdown", config: col, entries }];
    }),
  );
  return new Map(loaded.filter((x): x is [string, LoadedCollection] => x !== null));
}

/** Root-level entry point: resolves the repo's content config (resume preset
 * when absent) and loads its collections from `<rootDir>/kb`. */
export async function loadContent(rootDir: string, lang: KbLang = "en"): Promise<LoadedContent> {
  const config = resolveContentConfig(loadContentConfig(rootDir));
  const collections = await loadCollections(path.join(rootDir, "kb"), lang, config);
  return { config, lang, collections };
}

/**
 * Projects engine output into the typed resume `Kb`. Collections that are
 * absent (or that a custom config re-typed away from the preset schema) fall
 * back to empty; `profile` and `public-contact` are mandatory because the app
 * shell renders from them.
 */
export function toResumeKb(content: LoadedContent): Kb {
  const yamlData = <T>(name: string, schemaKey: string): T | undefined => {
    const c = content.collections.get(name);
    return c?.kind === "yaml" && c.config.schemaKey === schemaKey ? (c.data as T) : undefined;
  };
  const mdEntries = <F>(name: string, schemaKey: string): GenericEntry<F>[] => {
    const c = content.collections.get(name);
    return c?.kind === "markdown" && c.config.schemaKey === schemaKey
      ? (c.entries as GenericEntry<F>[])
      : [];
  };
  const profile = yamlData<Profile>("profile", "profile");
  const publicContact = yamlData<PublicContact>("public-contact", "public-contact");
  if (!profile || !publicContact) {
    throw new Error("KB: the profile and public-contact collections are required");
  }
  return {
    profile,
    publicContact,
    skills: yamlData<Skills>("skills", "skills") ?? { skills: [] },
    education: yamlData<Education>("education", "education") ?? { entries: [] },
    experience: mdEntries<ExperienceFrontmatter>("experience", "experience"),
    projects: mdEntries<ProjectFrontmatter>("projects", "project"),
    talks: mdEntries<TalkFrontmatter>("talks", "talk"),
    recommendations: mdEntries<RecommendationFrontmatter>("recommendations", "recommendation"),
  };
}

/** Legacy entry point: loads `kbDir` with the resume preset (no config read).
 * Kept for callers/tests that address the kb directory directly. */
export async function loadKb(kbDir: string, lang: KbLang = "en"): Promise<Kb> {
  const collections = await loadCollections(kbDir, lang, RESUME_PRESET);
  return toResumeKb({ config: RESUME_PRESET, lang, collections });
}
```

- [ ] **Step 4: Run the new and existing loader tests**

Run: `pnpm vitest run tests/lib/kb/loader-generic.test.ts tests/lib/kb/loader.test.ts`
Expected: PASS. If `loader.test.ts` fails on error-message wording, the new message must be adjusted to match the legacy text (the legacy labels were `profile.yaml`, `skills.yaml`, etc. — `readYamlCollection` reproduces them as `${col.name}.yaml`).

- [ ] **Step 5: Typecheck the whole app (loader types ripple into cv/components)**

Run: `pnpm typecheck`
Expected: PASS — `ExperienceEntry` et al. are structurally identical aliases.

- [ ] **Step 6: Commit**

```bash
git add lib/kb/loader.ts tests/lib/kb/loader-generic.test.ts
git commit -m "feat(kb): generic collection loader with resume-preset projection"
```

---

### Task 4: Generic assembler

Renderers take their data directly; `assemblePublicKbText(kb)` keeps its exact output; new `assembleContentText(content)` renders any config. Byte-stability is asserted by test.

**Files:**
- Modify: `lib/kb/assembler.ts` (full rewrite below)
- Test: `tests/lib/kb/assembler-generic.test.ts` (new)
- Existing test must stay green: `tests/lib/kb/assembler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/assembler-generic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadContent, loadKb } from "@/lib/kb/loader";
import { assembleContentText, assemblePublicKbText } from "@/lib/kb/assembler";

const CUSTOM_ROOT = path.join(__dirname, "../../fixtures/content-custom");
const PERSONA_ROOT = path.join(__dirname, "../../fixtures/persona");

describe("assembleContentText", () => {
  it("is byte-identical to the legacy assembler for a no-config repo", async () => {
    const content = await loadContent(PERSONA_ROOT);
    const kb = await loadKb(path.join(PERSONA_ROOT, "kb"));
    expect(assembleContentText(content)).toBe(assemblePublicKbText(kb));
  });

  it("renders generic markdown collections with [ref:] markers", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text).toContain("# Notes");
    expect(text).toContain("## Second note");
    expect(text).toContain("[ref: notes/2026-01-first-note.md]");
    expect(text).toContain("tags: alpha, beta");
    expect(text).toContain("The first note's body.");
  });

  it("renders generic yaml collections verbatim with a [ref:] marker", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text).toContain("# Glossary");
    expect(text).toContain("[ref: glossary.yaml]");
    expect(text).toContain("definition: A widget with opinions.");
  });

  it("orders sections by config order", async () => {
    const content = await loadContent(CUSTOM_ROOT);
    const text = assembleContentText(content);
    expect(text.indexOf("# Profile")).toBeLessThan(text.indexOf("# Notes"));
    expect(text.indexOf("# Notes")).toBeLessThan(text.indexOf("# Glossary"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/assembler-generic.test.ts`
Expected: FAIL — `assembleContentText` is not exported.

- [ ] **Step 3: Rewrite `lib/kb/assembler.ts`**

Replace the whole file with (every legacy renderer keeps its exact output — only the parameter changes from `Kb` to the section data):

```ts
import type {
  Kb,
  KbLang,
  LoadedCollection,
  LoadedContent,
  ExperienceEntry,
  ProjectEntry,
  TalkEntry,
  RecommendationEntry,
} from "./loader";
import type { Profile, Skills, Education, PublicContact, Repo } from "./schemas";
import { humanizeSlug } from "./meta-format";

/** Legacy typed entry point — exact output preserved (resume surfaces, tests). */
export function assemblePublicKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb.profile));
  sections.push(renderSkills(kb.skills));
  sections.push(renderEducation(kb.education));
  sections.push(renderPublicContact(kb.publicContact));
  sections.push(renderExperience(kb.experience));
  sections.push(renderProjects(kb.projects));
  if (kb.talks.length) sections.push(renderTalks(kb.talks));
  if (kb.recommendations.length) sections.push(renderRecommendations(kb.recommendations));

  return sections.join("\n\n");
}

/**
 * Engine entry point: renders collections in config order. Preset schemas use
 * the legacy renderers (byte-identical for no-config repos); generic
 * collections get a structural rendering with the same `[ref:]` convention.
 */
export function assembleContentText(content: LoadedContent): string {
  const sections: string[] = [];
  for (const col of content.config.collections) {
    const loaded = content.collections.get(col.name);
    if (!loaded) continue;
    const text = renderCollection(loaded, content.lang);
    if (text !== null) sections.push(text);
  }
  return sections.join("\n\n");
}

function renderCollection(loaded: LoadedCollection, lang: KbLang): string | null {
  if (loaded.kind === "yaml") {
    switch (loaded.config.schemaKey) {
      case "profile":
        return renderProfile(loaded.data as Profile);
      case "skills":
        return renderSkills(loaded.data as Skills);
      case "education":
        return renderEducation(loaded.data as Education);
      case "public-contact":
        return renderPublicContact(loaded.data as PublicContact);
      default:
        return renderGenericYaml(loaded, lang);
    }
  }
  switch (loaded.config.schemaKey) {
    case "experience":
      return renderExperience(loaded.entries as ExperienceEntry[]);
    case "project":
      return renderProjects(loaded.entries as ProjectEntry[]);
    case "talk":
      return loaded.entries.length ? renderTalks(loaded.entries as TalkEntry[]) : null;
    case "recommendation":
      return loaded.entries.length
        ? renderRecommendations(loaded.entries as RecommendationEntry[])
        : null;
    default:
      return loaded.entries.length ? renderGenericMarkdown(loaded, lang) : null;
  }
}

function labelFor(loaded: LoadedCollection, lang: KbLang): string {
  const label = loaded.config.label;
  return (lang === "fr" ? label?.fr : undefined) ?? label?.en ?? humanizeSlug(loaded.config.name);
}

/** Generic yaml: the raw file IS the structured content — emit it verbatim
 * under a heading + ref so the agent can read and cite it. */
function renderGenericYaml(
  loaded: Extract<LoadedCollection, { kind: "yaml" }>,
  lang: KbLang,
): string {
  return [`# ${labelFor(loaded, lang)}`, `[ref: ${loaded.relativePath}]`, ``, loaded.raw.trim()].join("\n");
}

/** Scalars and scalar arrays render on the entry's metadata lines; nested
 * objects are skipped — the body carries the narrative. */
function scalarOrList(v: unknown): string | null {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (
    Array.isArray(v) &&
    v.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")
  ) {
    return v.join(", ");
  }
  return null;
}

function renderGenericMarkdown(
  loaded: Extract<LoadedCollection, { kind: "markdown" }>,
  lang: KbLang,
): string {
  const lines = [`# ${labelFor(loaded, lang)}`, ``];
  for (const e of loaded.entries) {
    const fm = e.frontmatter;
    const title =
      (typeof fm.title === "string" && fm.title) ||
      (typeof fm.name === "string" && fm.name) ||
      humanizeSlug(e.slug);
    lines.push(`## ${title}`);
    lines.push(`[ref: ${e.relativePath}]`);
    for (const [k, v] of Object.entries(fm)) {
      if (k === "title" || k === "name") continue;
      const rendered = scalarOrList(v);
      if (rendered !== null) lines.push(`${k}: ${rendered}`);
    }
    lines.push(``, e.body, ``);
  }
  return lines.join("\n");
}

function renderProfile(profile: Profile): string {
  const lines = [
    `# Profile`,
    `[ref: profile.yaml]`,
    ``,
    `Name: ${profile.name}`,
    `Headline: ${profile.headline}`,
  ];
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages?.length) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.links) {
    for (const [k, v] of Object.entries(profile.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderSkills(skills: Skills): string {
  const lines = [`# Skills`, `[ref: skills.yaml]`, ``];
  for (const skill of skills.skills) {
    const tags = skill.tags?.length ? ` (tags: ${skill.tags.join(", ")})` : "";
    lines.push(`- ${skill.name} — level: ${skill.level}/5, years: ${skill.years}${tags}`);
  }
  return lines.join("\n");
}

function renderEducation(education: Education): string {
  const lines = [`# Education`, `[ref: education.yaml]`, ``];
  for (const e of education.entries) {
    const notes = e.notes ? ` — ${e.notes}` : "";
    lines.push(`- ${e.institution}, ${e.degree} (${e.start} → ${e.end})${notes}`);
  }
  return lines.join("\n");
}

function renderPublicContact(publicContact: PublicContact): string {
  const lines = [`# Public contact`, `[ref: public-contact.yaml]`, ``];
  if (publicContact.email) lines.push(`Email: ${publicContact.email}`);
  if (publicContact.links) {
    for (const [k, v] of Object.entries(publicContact.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderExperience(entries: ExperienceEntry[]): string {
  const lines = [`# Experience`, ``];
  for (const e of entries) {
    const { company, role, start, end, location, stack, tags } = e.frontmatter;
    lines.push(`## ${company} — ${role} (${start} → ${end})`);
    lines.push(`[ref: ${e.relativePath}]`);
    if (location) lines.push(`Location: ${location}`);
    if (stack?.length) lines.push(`Stack: ${stack.join(", ")}`);
    if (tags?.length) lines.push(`Tags: ${tags.join(", ")}`);
    lines.push(``);
    lines.push(e.body);
    lines.push(``);
  }
  return lines.join("\n");
}

function renderProjects(entries: ProjectEntry[]): string {
  const lines = [`# Projects`, ``];
  for (const p of entries) {
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

function renderTalks(entries: TalkEntry[]): string {
  const lines = [`# Talks`, ``];
  for (const t of entries) {
    const where = t.frontmatter.location ? ` — ${t.frontmatter.location}` : "";
    lines.push(`## ${t.frontmatter.title} (${t.frontmatter.year})`);
    lines.push(`[ref: ${t.relativePath}]`);
    lines.push(`Venue: ${t.frontmatter.venue}${where}`);
    if (t.frontmatter.url) lines.push(`URL: ${t.frontmatter.url}`);
    if (t.frontmatter.tags?.length) lines.push(`Tags: ${t.frontmatter.tags.join(", ")}`);
    lines.push(``, t.body, ``);
  }
  return lines.join("\n");
}

function renderRecommendations(entries: RecommendationEntry[]): string {
  const lines = [`# Recommendations`, ``];
  for (const r of entries) {
    lines.push(`## ${r.frontmatter.from} — ${r.frontmatter.title} (${r.frontmatter.date})`);
    lines.push(`[ref: ${r.relativePath}]`);
    if (r.frontmatter.relationship) lines.push(`Relationship: ${r.frontmatter.relationship}`);
    if (r.frontmatter.url) lines.push(`URL: ${r.frontmatter.url}`);
    lines.push(``, r.body, ``);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the new and existing assembler tests**

Run: `pnpm vitest run tests/lib/kb/assembler-generic.test.ts tests/lib/kb/assembler.test.ts`
Expected: PASS — the byte-identity test is the critical one.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/assembler.ts tests/lib/kb/assembler-generic.test.ts
git commit -m "feat(kb): config-driven assembler with byte-stable resume preset"
```

---

### Task 5: Config-aware sync gate

**Files:**
- Modify: `lib/persona-source.ts:44-67` (the `REQUIRED_PERSONA_FILES` const + `validatePersonaTree`)
- Test: `tests/lib/persona-source-required.test.ts` (new)
- Existing test must stay green: `tests/lib/persona-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/persona-source-required.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { requiredPersonaFiles, validatePersonaTree } from "@/lib/persona-source";
import { RESUME_PRESET, resolveContentConfig, loadContentConfig } from "@/lib/kb/content-config";

const CUSTOM_ROOT = path.join(__dirname, "../fixtures/content-custom");

describe("requiredPersonaFiles", () => {
  it("reproduces the legacy 10-file list for the resume preset", () => {
    expect(new Set(requiredPersonaFiles(RESUME_PRESET))).toEqual(
      new Set([
        "persona.yaml",
        "prompts/system.md",
        "kb/profile.yaml",
        "kb/profile.fr.yaml",
        "kb/public-contact.yaml",
        "kb/public-contact.fr.yaml",
        "kb/skills.yaml",
        "kb/skills.fr.yaml",
        "kb/education.yaml",
        "kb/education.fr.yaml",
      ]),
    );
  });

  it("derives required files from a custom config (en-only → no .fr siblings)", () => {
    const config = resolveContentConfig(loadContentConfig(CUSTOM_ROOT));
    expect(requiredPersonaFiles(config)).toEqual([
      "persona.yaml",
      "prompts/system.md",
      "kb/profile.yaml",
      "kb/public-contact.yaml",
    ]);
  });
});

describe("validatePersonaTree with content.config.yaml", () => {
  it("accepts the custom fixture", () => {
    expect(validatePersonaTree(CUSTOM_ROOT)).toBeNull();
  });

  it("rejects a malformed content.config.yaml", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "persona-tree-"));
    writeFileSync(path.join(dir, "content.config.yaml"), "collections: 12");
    mkdirSync(path.join(dir, "kb"), { recursive: true });
    const result = validatePersonaTree(dir);
    expect(result).toMatch(/content\.config\.yaml/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/persona-source-required.test.ts`
Expected: FAIL — `requiredPersonaFiles` is not exported.

- [ ] **Step 3: Replace the gate in `lib/persona-source.ts`**

Add the import at the top (alongside existing imports):

```ts
import {
  loadContentConfig,
  resolveContentConfig,
  type ResolvedContentConfig,
} from "@/lib/kb/content-config";
```

Replace the `REQUIRED_PERSONA_FILES` const and `validatePersonaTree` (currently lines 44–67) with:

```ts
/** Files every persona repo needs regardless of its content config. */
export const BASE_REQUIRED_PERSONA_FILES = ["persona.yaml", "prompts/system.md"] as const;

/**
 * The sync gate's required-file list, derived from the content config:
 * the base files plus, for every `required: true` yaml collection, the
 * canonical file and one localized sibling per extra declared locale.
 */
export function requiredPersonaFiles(config: ResolvedContentConfig): string[] {
  const files: string[] = [...BASE_REQUIRED_PERSONA_FILES];
  const extraLocales = config.locales.slice(1); // first locale is canonical (bare filename)
  for (const col of config.collections) {
    if (col.kind !== "yaml" || !col.required) continue;
    files.push(`kb/${col.name}.yaml`);
    for (const locale of extraLocales) files.push(`kb/${col.name}.${locale}.yaml`);
  }
  return files;
}

/**
 * Returns `null` if the tree is valid. Otherwise returns a single
 * human-readable error: either an invalid `content.config.yaml` (when present)
 * or the list of missing required files.
 */
export function validatePersonaTree(root: string): string | null {
  let config: ResolvedContentConfig;
  try {
    config = resolveContentConfig(loadContentConfig(root));
  } catch (err) {
    return (err as Error).message;
  }
  const missing = requiredPersonaFiles(config).filter(
    (rel) => !fs.existsSync(path.join(root, rel)),
  );
  if (missing.length === 0) return null;
  return `missing required file(s): ${missing.join(", ")}`;
}
```

`REQUIRED_PERSONA_FILES` is deleted — `grep -rn "REQUIRED_PERSONA_FILES" --include="*.ts*"` confirmed `lib/persona-source.ts` was its only user.

- [ ] **Step 4: Run new + existing persona-source tests**

Run: `pnpm vitest run tests/lib/persona-source-required.test.ts tests/lib/persona-source.test.ts`
Expected: PASS. **Known acceptable diff:** the missing-file error now lists files in collection order (`profile, skills, education, public-contact`) instead of the legacy const order (`profile, public-contact, skills, education`). If a `persona-source.test.ts` assertion checks message ordering, update the expectation — the *set* of files is unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-source.ts tests/lib/persona-source-required.test.ts tests/lib/persona-source.test.ts
git commit -m "feat(sync): derive required persona files from the content config"
```

---

### Task 6: Cache + server consumers on the engine path

After this task, the chat agent, MCP server, CV, about page, and scripts all flow through `loadContent`, so custom collections reach the agent prompt.

**Files:**
- Modify: `lib/kb/cache.ts`
- Modify: `lib/cv/load.ts:22-26`
- Modify: `app/about/page.tsx:5-6,42-43`
- Modify: `scripts/eval.ts:41-42` (and its imports)
- Modify: `scripts/validate-kb.ts`

- [ ] **Step 1: Rewrite `lib/kb/cache.ts`**

Replace the imports and the three cache sections (keep `MAX_ACCOUNTS`, `lruGet`, `lruSet`, `rootFor`, `kbDir`, and the manifest cache exactly as they are):

```ts
import path from "node:path";
import {
  loadContent,
  toResumeKb,
  type Kb,
  type KbLang,
  type LoadedContent,
} from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { getPersonaStore } from "@/lib/persona/store";
```

Replace the `parsedKbByAccount`/`publicKbTextByAccount` maps and the `getCachedKb`/`getCachedPublicKbText` functions with:

```ts
const contentByAccount = new Map<string, Map<KbLang, LoadedContent>>();
const publicKbTextByAccount = new Map<string, Map<KbLang, string>>();
const manifestByAccount = new Map<string, KbFile[]>();

export function resetKbCache(accountId?: string): void {
  if (accountId === undefined) {
    contentByAccount.clear();
    publicKbTextByAccount.clear();
    manifestByAccount.clear();
    return;
  }
  contentByAccount.delete(accountId);
  publicKbTextByAccount.delete(accountId);
  manifestByAccount.delete(accountId);
}

/** The loaded content engine output for an account (config + collections). */
export async function getCachedContent(accountId: string, lang: KbLang = "en"): Promise<LoadedContent> {
  let byLang = lruGet(contentByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(contentByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const content = await loadContent(rootFor(accountId), lang);
  byLang.set(lang, content);
  return content;
}

/** The typed resume projection for an account (CV, forward-question email). */
export async function getCachedKb(accountId: string, lang: KbLang = "en"): Promise<Kb> {
  return toResumeKb(await getCachedContent(accountId, lang));
}

/** The assembled public KB text for an account. */
export async function getCachedPublicKbText(accountId: string, lang: KbLang = "en"): Promise<string> {
  let byLang = lruGet(publicKbTextByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(publicKbTextByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const content = await getCachedContent(accountId, lang);
  const text = assembleContentText(content);
  byLang.set(lang, text);
  return text;
}
```

(The `kbDir` helper stays — `getCachedKbManifest` still uses it.)

- [ ] **Step 2: Update `lib/cv/load.ts`**

Replace the import of `loadKb` and the body of `loadCvKb`:

```ts
import { loadContent, toResumeKb, type KbLang, type Kb } from "@/lib/kb/loader";
```

and in `loadCvKb` replace

```ts
  const [kb, config] = await Promise.all([
    loadKb(path.join(root, "kb"), lang),
    loadCvConfig(root),
  ]);
```

with

```ts
  const [content, config] = await Promise.all([
    loadContent(root, lang),
    loadCvConfig(root),
  ]);
  const kb = toResumeKb(content);
```

(The unused `path` import may then be removable — check remaining usages in the file before deleting it.)

- [ ] **Step 3: Update `app/about/page.tsx`**

Replace lines 5–6:

```ts
import { loadContent, toResumeKb } from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
```

Replace lines 42–43:

```ts
  const content = await loadContent(root);
  const kb = toResumeKb(content);
  const text = assembleContentText(content);
```

(`kb.profile` is still used at lines 47–48; the `path` import becomes unused — remove it.)

- [ ] **Step 4: Update `scripts/eval.ts`**

Replace the `loadKb`/`assemblePublicKbText` imports with `loadContent`/`assembleContentText` and lines 41–42 with:

```ts
  const content = await loadContent(contentRoot);
  const kbText = assembleContentText(content);
```

- [ ] **Step 5: Rewrite `scripts/validate-kb.ts` main**

```ts
import path from "node:path";
import fs from "node:fs";
import { loadContent } from "../lib/kb/loader";
import { assembleContentText } from "../lib/kb/assembler";

/**
 * Resolve the content root. Queritae is now a content-free shell — the KB lives
 * in an external persona repo. Point this script at a local checkout via
 * PERSONA_LOCAL_OVERRIDE (e.g. `PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb`).
 */
function contentRoot(): string {
  const override = process.env.PERSONA_LOCAL_OVERRIDE;
  if (override) return override;
  throw new Error(
    "No content root. Set PERSONA_LOCAL_OVERRIDE to a local persona repo checkout, " +
      "e.g. PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb",
  );
}

async function main() {
  const root = path.resolve(contentRoot());
  if (!fs.existsSync(path.join(root, "kb"))) {
    throw new Error(`No kb/ directory at ${path.join(root, "kb")}`);
  }
  const content = await loadContent(root);
  const text = assembleContentText(content);
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  for (const col of content.config.collections) {
    const loaded = content.collections.get(col.name);
    if (!loaded) {
      console.log(`  ${col.name}: (absent)`);
    } else if (loaded.kind === "yaml") {
      console.log(`  ${col.name}: ok`);
    } else {
      const repoCount = loaded.entries.reduce((n, e) => {
        const repos = (e.frontmatter as { repos?: unknown[] }).repos;
        return n + (Array.isArray(repos) ? repos.length : 0);
      }, 0);
      const extra = repoCount > 0 ? ` (${repoCount} repos)` : "";
      console.log(`  ${col.name}: ${loaded.entries.length} entries${extra}`);
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify — full suite, typecheck, and the validator against both fixtures**

```bash
pnpm test && pnpm typecheck
PERSONA_LOCAL_OVERRIDE=tests/fixtures/persona pnpm validate:kb
PERSONA_LOCAL_OVERRIDE=tests/fixtures/content-custom pnpm validate:kb
```

Expected: tests + typecheck PASS; first validate prints per-collection counts for the 8 resume collections; second prints `profile: ok`, `public-contact: ok`, `notes: 2 entries`, `glossary: ok`.

- [ ] **Step 7: Commit**

```bash
git add lib/kb/cache.ts lib/cv/load.ts app/about/page.tsx scripts/eval.ts scripts/validate-kb.ts
git commit -m "refactor(kb): route cache, CV, about, and scripts through the content engine"
```

---

### Task 7: Manifest `groups` API

**Files:**
- Modify: `lib/kb/manifest.ts` (use shared `humanizeSlug`; pick `date`)
- Modify: `lib/kb/meta-format.ts` (`date` subtitle fallback)
- Modify: `lib/kb/handlers.ts` (`groups` in the manifest response)
- Existing tests to update: `tests/lib/kb/handlers.test.ts`, `tests/lib/kb/manifest.test.ts` (only if they assert the exact response/meta shape)

- [ ] **Step 1: Write the failing test additions**

In `tests/lib/kb/handlers.test.ts`, add to the manifest-route describe block (match the file's existing setup helpers — it already calls `handleKbManifest` with a configured fixture root):

```ts
it("returns the resume groups for a no-config persona", async () => {
  const res = await handleKbManifest(ACCOUNT_ID); // reuse the file's existing account/fixture setup
  const body = await res.json();
  expect(body.groups).toEqual([
    { name: "experience" },
    { name: "projects" },
    { name: "talks" },
    { name: "recommendations" },
  ]);
});
```

In `tests/lib/kb/manifest.test.ts`, add:

```ts
it("picks a generic date into meta", async () => {
  const files = await loadKbManifest(
    path.join(__dirname, "../../fixtures/content-custom/kb"),
  );
  const note = files.find((f) => f.path === "notes/2026-01-first-note.md");
  expect(note?.meta?.date).toBe("2026-01");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/handlers.test.ts tests/lib/kb/manifest.test.ts`
Expected: FAIL — `groups` undefined; `meta.date` undefined.

- [ ] **Step 3: Implement**

`lib/kb/manifest.ts`:
1. Add `date?: string;` to `KbFileMeta` (after `end`).
2. In `pickMeta`, add `date: asString(data.date),` after the `end` pick.
3. Delete the local `humanize` function; `import { humanizeSlug } from "@/lib/kb/meta-format";` and replace both `humanize(` call sites with `humanizeSlug(`.

`lib/kb/meta-format.ts` — in `metaSubtitle`, add a date fallback before the final `return null`:

```ts
  if (meta.date) return meta.date;
```

`lib/kb/handlers.ts` — add imports:

```ts
import { kbGroups, loadContentConfig, resolveContentConfig } from "@/lib/kb/content-config";
import type { KbGroup } from "@/lib/kb/meta-format";
```

and in `handleKbManifest`, replace the `return NextResponse.json({ files: manifest });` line with:

```ts
    let groups: KbGroup[] = [];
    try {
      groups = kbGroups(resolveContentConfig(loadContentConfig(root)));
    } catch {
      // A malformed config never blocks the panel — the client falls back to
      // its default groups. (Sync rejects bad configs; this guards local overrides.)
    }
    return NextResponse.json({ files: manifest, groups });
```

(`groups` must be computed inside the existing `try` that wraps `getCachedKbManifest`, before the return.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/kb/handlers.test.ts tests/lib/kb/manifest.test.ts tests/lib/kb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/manifest.ts lib/kb/meta-format.ts lib/kb/handlers.ts tests/lib/kb/handlers.test.ts tests/lib/kb/manifest.test.ts
git commit -m "feat(kb): manifest API returns config-driven directory groups"
```

---

### Task 8: Dynamic groups in the KB panel client

**Files:**
- Modify: `components/kb/kb-context.tsx`
- Modify: `components/kb/kb-file-list.tsx`

No new unit tests (client components have no test harness in this repo — `tests/` covers lib only); verified by full-suite typecheck and the existing strings tests.

- [ ] **Step 1: Expose `groups` from `kb-context.tsx`**

1. Import the type: `import type { KbGroup } from "@/lib/kb/meta-format";`
2. Add to `KbContextValue`:

```ts
  /** Markdown directory groups in display order (from the content config). */
  groups: KbGroup[];
```

3. In `KbProvider`, add state and wire the fetch:

```ts
  const [groups, setGroups] = useState<KbGroup[]>([]);
```

and change the fetch handler to:

```ts
      .then((data: { files?: KbFile[]; groups?: KbGroup[] }) => {
        if (!cancelled) {
          setManifest(data.files ?? []);
          setGroups(data.groups ?? []);
        }
      })
```

4. Add `groups` to the `value` memo object **and** its dependency array.

- [ ] **Step 2: Rewrite the grouping logic in `kb-file-list.tsx`**

Replace the `GROUP_ORDER`/`GroupKey`/`groupOf` block (lines 11–24) with:

```ts
import { humanizeSlug, type KbGroup } from "@/lib/kb/meta-format";

/** Fallback when the manifest fetch hasn't resolved (or an old API omits
 * groups): the resume preset's directories. */
const DEFAULT_GROUPS: KbGroup[] = [
  { name: "experience" },
  { name: "projects" },
  { name: "talks" },
  { name: "recommendations" },
];
```

In `KbFileList`, pull `lang` and `groups` from context and group dynamically — replace the `grouped` construction and the `GROUP_ORDER.map(...)` render block with:

```ts
  const { strings, lang, groups: configGroups } = useKb();
  const groups = configGroups.length > 0 ? configGroups : DEFAULT_GROUPS;
  const known = new Set(groups.map((g) => g.name));

  // ... (cited/pinned logic unchanged) ...

  // Everything else, grouped by top-level directory; unknown dirs and
  // kb-root files fall into "other".
  const grouped = new Map<string, KbFile[]>();
  for (const g of groups) grouped.set(g.name, []);
  grouped.set("other", []);
  for (const f of manifest) {
    if (citedSet.has(f.path)) continue;
    if (f.path.startsWith("_virtual/")) continue;
    const top = f.path.split("/")[0];
    const key = known.has(top) ? top : "other";
    grouped.get(key)!.push(f);
  }

  const labelOf = (g: KbGroup): string =>
    (lang === "fr" ? g.label?.fr : undefined) ??
    g.label?.en ??
    (strings.sections as Record<string, string | undefined>)[g.name] ??
    humanizeSlug(g.name);
```

and render:

```tsx
      {groups.map((g) => (
        <Group key={g.name} label={labelOf(g)} files={grouped.get(g.name) ?? []} onOpen={onOpen} />
      ))}
      <Group label={strings.sections.other} files={grouped.get("other") ?? []} onOpen={onOpen} />
```

(`useKb` was already destructured at the top of `KbFileList` — merge, don't duplicate. `lang` is already in the context type.)

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Manual smoke check (only if a dev persona is configured)**

If `PERSONA_LOCAL_OVERRIDE` points at a content checkout, start the dev server and confirm the KB panel still shows Experience/Projects/Talks/Recommendations groups. Otherwise skip — typecheck + the handlers test cover the contract.

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-context.tsx components/kb/kb-file-list.tsx
git commit -m "feat(kb): KB panel renders config-driven directory groups"
```

---

### Task 9: Documentation + final verification

**Files:**
- Modify: `docs/content-repo-guide.md`

- [ ] **Step 1: Add a "Custom collections" section to the guide**

Insert after §2 ("Repo layout") a new section (renumber or use `2bis` style header consistent with the doc — prefer inserting as a new `## Custom collections (content.config.yaml)` right after §2):

```markdown
## Custom collections (`content.config.yaml`) — optional

Queritae's KB is not hardwired to a resume. Without any config, the layout in
§2 applies (the **resume preset**). To change it, add a `content.config.yaml`
at the repo root declaring your own collections:

```yaml
locales: [en]              # declared content locales; first is canonical.
                           # Default: [en, fr] (both required for yaml
                           # collections marked required).
collections:
  - name: profile          # profile + public-contact are always required —
    kind: yaml             # the app shell renders the page from them.
    schema: profile
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: notes            # a custom markdown collection: kb/notes/<slug>.md
    kind: markdown
    label: { en: Notes, fr: Notes }
    sort: { field: date, order: desc }
  - name: glossary         # a custom yaml collection: kb/glossary.yaml
    kind: yaml
    label: { en: Glossary }
```

- `kind: markdown` → a `kb/<name>/` folder of `<slug>.md` files (frontmatter +
  body, like §6). `kind: yaml` → a single `kb/<name>.yaml` file.
- `schema` is optional: a preset name (`profile`, `skills`, `education`,
  `public-contact`, `experience`, `project`, `talk`, `recommendation`) reuses
  that validation and prompt rendering; omitted → `generic` (any frontmatter /
  any YAML mapping, rendered structurally with the same `[ref:]` citation
  markers).
- `required: true` (yaml only) adds the file — and a localized sibling per
  extra declared locale — to the sync gate.
- Collection order is assembly order in the agent's prompt and display order
  in the KB panel; `label` localizes the panel group heading.
- The agent's behavior for your domain lives in `prompts/system.md` as always —
  the config only declares structure.

Declaring a config replaces the preset entirely: list every collection you
want, including the resume ones you keep. CV curation (§8) only applies to
collections using the resume preset schemas.
```

(When inserting, keep the doc's existing TL;DR and §2 untouched — the preset remains the default path for newcomers.)

- [ ] **Step 2: Full verification**

```bash
pnpm test && pnpm typecheck && pnpm build
```

Expected: all PASS. `pnpm build` confirms no client bundle pulled a node-only module (the `KbGroup`-in-`meta-format` placement exists precisely for this).

- [ ] **Step 3: Commit**

```bash
git add docs/content-repo-guide.md
git commit -m "docs: document content.config.yaml custom collections"
```

---

## Self-review notes (already applied)

- **Byte-stability:** Task 4 Step 1's first test is the contract. The preset renderers were moved verbatim; `assemblePublicKbText` composes them identically; the engine iterates `RESUME_PRESET` collections in the same order with the same empty-section rules (experience/projects always render, talks/recommendations skip when empty).
- **Sort equivalence:** the legacy comparators (`a<b?1:-1`, `(b.year??0)-(a.year??0)`) and the generic `compareEntries` agree on all inputs the schemas admit (dates/years present-or-missing); equal keys keep input order under V8's stable sort, matching the legacy `-1`-on-equal behavior.
- **Type continuity:** `ExperienceEntry` etc. become aliases of `GenericEntry<F>` with identical structure, so `cv-config.ts`, `repos.ts`, and the CV components compile untouched.
- **Client safety:** `KbGroup` + `humanizeSlug` live in `meta-format.ts` (no node imports); `content-config.ts` (node `fs`) is only imported server-side; the client receives groups via the manifest API.
- **Sync gate compat:** default required-file *set* unchanged (Task 5 test asserts set equality); only message ordering may differ.
- **Known behavior changes (intentional):** `validate:kb` output format is now per-collection; the manifest API response gains a `groups` key (additive); `REQUIRED_PERSONA_FILES` export is removed (no external users).

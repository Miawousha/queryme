# Queryme — Plan 1: Foundation + Chat MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, deployable web chat where any visitor can ask questions about Alexandre and get streamed, cited answers in EN or FR, grounded in a hybrid Markdown+YAML knowledge base loaded from this repo.

**Architecture:** Next.js 15 App Router on Vercel. A single `lib/answerer.ts` calls Anthropic via the Vercel AI SDK with prompt caching, sending the whole KB in the cached system prefix. The chat UI uses shadcn/ui + the AI SDK's `useChat`. No database, no auth, no MCP, no admin in this plan — those are Plans 2–4. Spec: [docs/superpowers/specs/2026-05-20-queryme-design.md](../specs/2026-05-20-queryme-design.md).

**Tech Stack:** TypeScript, Next.js 15 (App Router), React 19, shadcn/ui, Tailwind v4, Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Zod, gray-matter, yaml, react-markdown, Vitest + @testing-library/react, pnpm.

**Out of scope for this plan (deferred to later plans):** Postgres, identification flow, gated/sensitive content, MCP server, admin panel, lead capture, GitHub OAuth, rate limiting.

---

## File structure produced by this plan

```
queryme/
├── package.json                       # Task 1
├── pnpm-lock.yaml                     # Task 1
├── tsconfig.json                      # Task 1
├── next.config.ts                     # Task 1
├── postcss.config.mjs                 # Task 1
├── tailwind.config.ts                 # Task 1
├── components.json                    # Task 1 (shadcn config)
├── vitest.config.ts                   # Task 1
├── vitest.setup.ts                    # Task 1
├── .env.example                       # Task 1
├── README.md                          # Task 14
├── app/
│   ├── layout.tsx                     # Task 1
│   ├── globals.css                    # Task 1
│   ├── page.tsx                       # Task 12
│   └── api/chat/route.ts              # Task 8
├── components/
│   ├── chat.tsx                       # Task 10
│   ├── chat-message.tsx               # Task 9
│   ├── chat-starter-chips.tsx         # Task 11
│   ├── language-toggle.tsx            # Task 12
│   └── ui/                            # shadcn primitives (Task 1)
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── textarea.tsx
├── lib/
│   ├── kb/
│   │   ├── schemas.ts                 # Task 2
│   │   ├── loader.ts                  # Task 3
│   │   ├── assembler.ts               # Task 4
│   │   └── citations.ts               # Task 5
│   ├── prompts.ts                     # Task 6
│   ├── answerer.ts                    # Task 7
│   ├── language.ts                    # Task 12 (helper)
│   └── utils.ts                       # Task 1 (shadcn cn helper)
├── prompts/
│   └── system.md                      # Task 6
├── kb/                                # Task 13 — sample content
│   ├── profile.yaml
│   ├── skills.yaml
│   ├── education.yaml
│   ├── public-contact.yaml
│   ├── experience/2022-matrice.md
│   └── projects/queryme.md
└── tests/
    ├── fixtures/kb/                   # Task 2 (created), grown by later tasks
    │   ├── profile.yaml
    │   ├── skills.yaml
    │   ├── education.yaml
    │   ├── public-contact.yaml
    │   ├── experience/2024-fixture-co.md
    │   └── projects/fixture-project.md
    └── lib/
        ├── kb/
        │   ├── schemas.test.ts        # Task 2
        │   ├── loader.test.ts         # Task 3
        │   ├── assembler.test.ts      # Task 4
        │   └── citations.test.ts      # Task 5
        ├── prompts.test.ts            # Task 6
        └── answerer.test.ts           # Task 7
```

**Conventions for every task in this plan:**
- Commit after each task. Commit messages use Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).
- All paths are relative to the repo root (`/Users/alexandrecollet/queryme`).
- Run commands from the repo root unless otherwise specified.
- Package manager is **pnpm**. If pnpm isn't installed: `corepack enable && corepack prepare pnpm@latest --activate`.

---

## Task 1: Bootstrap Next.js + shadcn + Tailwind + Vitest

This task is mostly scaffolding; there's no TDD because we're installing tooling, not implementing behavior. The "test" is `pnpm test` and `pnpm build` both succeeding at the end.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `components.json`, `vitest.config.ts`, `vitest.setup.ts`, `.env.example`, `lib/utils.ts`, plus shadcn `components/ui/*` primitives.

- [ ] **Step 1: Initialize pnpm and install Next.js + React**

Run from repo root:
```bash
pnpm init
pnpm add next@^15 react@^19 react-dom@^19
pnpm add -D typescript @types/react @types/react-dom @types/node
```

- [ ] **Step 2: Add Tailwind v4 + shadcn + utility deps**

```bash
pnpm add tailwindcss@^4 @tailwindcss/postcss postcss autoprefixer
pnpm add clsx tailwind-merge class-variance-authority lucide-react
pnpm add ai@^5 @ai-sdk/anthropic@^2 @ai-sdk/react@^2 zod gray-matter yaml react-markdown remark-gfm
```

> **Note:** the `ai@^5` pin is intentional. Tasks 7, 8, and 10 use v5-only APIs (`MockLanguageModelV2`, `DefaultChatTransport`, `convertToModelMessages`, `UIMessage.parts`). If you upgrade or downgrade, expect to update those files. Verify the cache-control surface for `@ai-sdk/anthropic` against the current docs via `context7` (library `vercel/ai`) before finalizing Task 7.

- [ ] **Step 3: Add dev deps for testing**

```bash
pnpm add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom vite-tsconfig-paths
```

- [ ] **Step 4: Write `package.json` scripts**

Open `package.json` and merge this `scripts` block (preserve `name`, `version`, etc. that `pnpm init` created):

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Write `tsconfig.json`**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Write `next.config.ts`**

Create `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
};

export default nextConfig;
```

- [ ] **Step 7: Configure Tailwind v4**

Create `postcss.config.mjs`:
```javascript
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};
export default config;
```

Create `app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #6b7280;
  --color-border: #e5e7eb;
  --color-accent: #2563eb;
  --color-accent-foreground: #ffffff;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: #0a0a0a;
    --color-foreground: #fafafa;
    --color-muted: #1a1a1a;
    --color-muted-foreground: #a1a1aa;
    --color-border: #27272a;
  }
}

html, body { height: 100%; }
body { background: var(--color-background); color: var(--color-foreground); font-family: ui-sans-serif, system-ui, sans-serif; }
```

- [ ] **Step 8: Write `app/layout.tsx`**

Create `app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alexandre Collet — queryable CV",
  description: "Ask the agent about Alexandre's background, experience, and projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write a placeholder `app/page.tsx`**

Create `app/page.tsx` (will be replaced in Task 12):
```typescript
export default function Home() {
  return <main className="p-8">Queryme — scaffolding in progress.</main>;
}
```

- [ ] **Step 10: Write shadcn-compatible `lib/utils.ts` and `components.json`**

Create `lib/utils.ts`:
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 11: Install shadcn primitives**

```bash
pnpm dlx shadcn@latest add button card input textarea
```

When prompted to install required deps, accept. This generates `components/ui/{button,card,input,textarea}.tsx`.

- [ ] **Step 12: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

Create `vitest.setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 13: Write `.env.example`**

Create `.env.example`:
```bash
# Anthropic API key for the chat agent
ANTHROPIC_API_KEY=

# Public repo URL — used to build citation links into the KB
# Format: https://github.com/<owner>/<repo>
NEXT_PUBLIC_REPO_URL=https://github.com/Miawousha/queryme

# Default branch citations point at (typically "main")
NEXT_PUBLIC_REPO_BRANCH=main
```

- [ ] **Step 14: Verify everything builds and starts**

```bash
pnpm install
pnpm typecheck
pnpm build
```

Expected: typecheck passes, `pnpm build` completes successfully with the placeholder home page.

```bash
pnpm test
```

Expected: Vitest runs, reports "No test files found" — that's fine for now.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 15 + shadcn + Tailwind v4 + Vitest"
```

---

## Task 2: KB Zod schemas

Defines the shape of every KB file using Zod. This is the single source of truth for what's allowed in `kb/`.

**Files:**
- Create: `lib/kb/schemas.ts`
- Create: `tests/lib/kb/schemas.test.ts`
- Create: `tests/fixtures/kb/profile.yaml` (valid example for tests)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/schemas.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
} from "@/lib/kb/schemas";

describe("ProfileSchema", () => {
  it("accepts a fully populated profile", () => {
    const data = {
      name: "Alexandre Collet",
      headline: "Founder / CTO at Matrice",
      location: "Paris, France",
      languages: ["en", "fr"],
      photo: "/photo.jpg",
      links: { linkedin: "https://linkedin.com/in/x", github: "https://github.com/x" },
    };
    expect(ProfileSchema.parse(data)).toEqual(data);
  });

  it("requires name and headline", () => {
    expect(() => ProfileSchema.parse({ name: "X" })).toThrow();
    expect(() => ProfileSchema.parse({ headline: "X" })).toThrow();
  });

  it("rejects unknown language codes", () => {
    const data = { name: "X", headline: "Y", languages: ["xx"] };
    expect(() => ProfileSchema.parse(data)).toThrow();
  });
});

describe("SkillsSchema", () => {
  it("accepts a list of skills with levels and years", () => {
    const data = {
      skills: [
        { name: "TypeScript", level: 5, years: 10 },
        { name: "Python", level: 4, years: 8, tags: ["backend"] },
      ],
    };
    expect(SkillsSchema.parse(data)).toEqual(data);
  });

  it("rejects levels outside 1..5", () => {
    expect(() => SkillsSchema.parse({ skills: [{ name: "X", level: 6, years: 1 }] })).toThrow();
    expect(() => SkillsSchema.parse({ skills: [{ name: "X", level: 0, years: 1 }] })).toThrow();
  });
});

describe("EducationSchema", () => {
  it("accepts a list of degrees", () => {
    const data = {
      entries: [
        { institution: "X University", degree: "MSc CS", start: "2014-09", end: "2016-06" },
      ],
    };
    expect(EducationSchema.parse(data)).toEqual(data);
  });
});

describe("PublicContactSchema", () => {
  it("accepts email + links", () => {
    const data = { email: "a@b.com", links: { linkedin: "https://linkedin.com/in/x" } };
    expect(PublicContactSchema.parse(data)).toEqual(data);
  });
});

describe("ExperienceFrontmatterSchema", () => {
  it("accepts a typical role", () => {
    const data = {
      company: "Matrice",
      role: "Founder",
      start: "2022-03",
      end: "present",
      location: "Paris",
      stack: ["TypeScript"],
      tags: ["founder"],
    };
    expect(ExperienceFrontmatterSchema.parse(data)).toEqual(data);
  });

  it("rejects malformed dates", () => {
    const data = { company: "X", role: "Y", start: "March 2022", end: "present" };
    expect(() => ExperienceFrontmatterSchema.parse(data)).toThrow();
  });
});

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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/kb/schemas.test.ts
```

Expected: FAIL — module `@/lib/kb/schemas` cannot be found.

- [ ] **Step 3: Implement the schemas**

Create `lib/kb/schemas.ts`:
```typescript
import { z } from "zod";

export const LanguageCode = z.enum(["en", "fr"]);

// YYYY-MM or YYYY-MM-DD or the literal "present"
const DateOrPresent = z.union([
  z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  z.literal("present"),
]);

export const ProfileSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  location: z.string().optional(),
  languages: z.array(LanguageCode).optional(),
  photo: z.string().optional(),
  links: z
    .object({
      linkedin: z.string().url().optional(),
      github: z.string().url().optional(),
      website: z.string().url().optional(),
      twitter: z.string().url().optional(),
    })
    .optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SkillSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  years: z.number().min(0),
  tags: z.array(z.string()).optional(),
});
export const SkillsSchema = z.object({ skills: z.array(SkillSchema) });
export type Skills = z.infer<typeof SkillsSchema>;

export const EducationEntrySchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  start: DateOrPresent,
  end: DateOrPresent,
  notes: z.string().optional(),
});
export const EducationSchema = z.object({ entries: z.array(EducationEntrySchema) });
export type Education = z.infer<typeof EducationSchema>;

export const PublicContactSchema = z.object({
  email: z.string().email().optional(),
  links: z
    .object({
      linkedin: z.string().url().optional(),
      github: z.string().url().optional(),
      website: z.string().url().optional(),
      twitter: z.string().url().optional(),
    })
    .optional(),
});
export type PublicContact = z.infer<typeof PublicContactSchema>;

export const ExperienceFrontmatterSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  start: DateOrPresent,
  end: DateOrPresent,
  location: z.string().optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type ExperienceFrontmatter = z.infer<typeof ExperienceFrontmatterSchema>;

export const ProjectFrontmatterSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  url: z.string().url().optional(),
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/lib/kb/schemas.test.ts
```

Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/schemas.ts tests/lib/kb/schemas.test.ts
git commit -m "feat(kb): add Zod schemas for KB files"
```

---

## Task 3: KB loader

Reads the `kb/` directory, validates every file against the schemas from Task 2, and returns a strongly typed in-memory representation.

**Files:**
- Create: `lib/kb/loader.ts`
- Create: `tests/lib/kb/loader.test.ts`
- Create: `tests/fixtures/kb/profile.yaml`
- Create: `tests/fixtures/kb/skills.yaml`
- Create: `tests/fixtures/kb/education.yaml`
- Create: `tests/fixtures/kb/public-contact.yaml`
- Create: `tests/fixtures/kb/experience/2024-fixture-co.md`
- Create: `tests/fixtures/kb/projects/fixture-project.md`

- [ ] **Step 1: Create the test fixtures**

Create `tests/fixtures/kb/profile.yaml`:
```yaml
name: Test Person
headline: Test headline
location: Test City
languages: [en, fr]
links:
  linkedin: https://linkedin.com/in/test
  github: https://github.com/test
```

Create `tests/fixtures/kb/skills.yaml`:
```yaml
skills:
  - name: TypeScript
    level: 5
    years: 10
    tags: [frontend, backend]
  - name: Python
    level: 4
    years: 8
```

Create `tests/fixtures/kb/education.yaml`:
```yaml
entries:
  - institution: Test University
    degree: MSc CS
    start: "2014-09"
    end: "2016-06"
```

Create `tests/fixtures/kb/public-contact.yaml`:
```yaml
email: test@example.com
links:
  linkedin: https://linkedin.com/in/test
```

Create `tests/fixtures/kb/experience/2024-fixture-co.md`:
```markdown
---
company: Fixture Co
role: Engineer
start: "2024-01"
end: present
location: Remote
stack: [TypeScript, Python]
tags: [test]
---

## What we do
Fixture body.

## Highlights
- Did a thing
- Did another thing

## Stories
### A story
Story body.
```

Create `tests/fixtures/kb/projects/fixture-project.md`:
```markdown
---
name: Fixture Project
year: 2025
stack: [TypeScript]
tags: [test]
url: https://example.com
---

## Summary
A fixture project body.
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/kb/loader.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("loadKb", () => {
  it("loads and validates every file in the fixture KB", async () => {
    const kb = await loadKb(FIXTURE_DIR);

    expect(kb.profile.name).toBe("Test Person");
    expect(kb.skills.skills).toHaveLength(2);
    expect(kb.skills.skills[0].name).toBe("TypeScript");
    expect(kb.education.entries[0].institution).toBe("Test University");
    expect(kb.publicContact.email).toBe("test@example.com");

    expect(kb.experience).toHaveLength(1);
    expect(kb.experience[0].slug).toBe("2024-fixture-co");
    expect(kb.experience[0].frontmatter.company).toBe("Fixture Co");
    expect(kb.experience[0].body).toContain("Fixture body.");
    expect(kb.experience[0].relativePath).toBe("experience/2024-fixture-co.md");

    expect(kb.projects).toHaveLength(1);
    expect(kb.projects[0].slug).toBe("fixture-project");
    expect(kb.projects[0].frontmatter.name).toBe("Fixture Project");
    expect(kb.projects[0].body).toContain("A fixture project body.");
    expect(kb.projects[0].relativePath).toBe("projects/fixture-project.md");
  });

  it("sorts experience entries by start date descending (most recent first)", async () => {
    const kb = await loadKb(FIXTURE_DIR);
    const starts = kb.experience.map((e) => e.frontmatter.start);
    const sorted = [...starts].sort((a, b) => (a < b ? 1 : -1));
    expect(starts).toEqual(sorted);
  });

  it("throws a descriptive error when a file fails validation", async () => {
    await expect(loadKb(path.resolve(__dirname, "../../fixtures/does-not-exist"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test tests/lib/kb/loader.test.ts
```

Expected: FAIL — module `@/lib/kb/loader` cannot be found.

- [ ] **Step 4: Implement the loader**

Create `lib/kb/loader.ts`:
```typescript
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
} from "./schemas";

export type ExperienceEntry = {
  slug: string;
  relativePath: string;
  frontmatter: ExperienceFrontmatter;
  body: string;
};

export type ProjectEntry = {
  slug: string;
  relativePath: string;
  frontmatter: ProjectFrontmatter;
  body: string;
};

export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
};

async function readYamlFile<T>(file: string, schema: { parse: (v: unknown) => T }, label: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`KB: failed to parse YAML in ${label} (${file}): ${(err as Error).message}`);
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    throw new Error(`KB: schema validation failed for ${label} (${file}): ${(err as Error).message}`);
  }
}

async function readMarkdownDir<F>(
  dir: string,
  schema: { parse: (v: unknown) => F },
  label: string,
): Promise<Array<{ slug: string; relativePath: string; frontmatter: F; body: string }>> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const md = files.filter((f) => f.endsWith(".md")).sort();
  const out = [];
  for (const file of md) {
    const full = path.join(dir, file);
    const raw = await fs.readFile(full, "utf8");
    const parsed = matter(raw);
    let frontmatter: F;
    try {
      frontmatter = schema.parse(parsed.data);
    } catch (err) {
      throw new Error(`KB: frontmatter validation failed for ${label} ${file}: ${(err as Error).message}`);
    }
    out.push({
      slug: file.replace(/\.md$/, ""),
      relativePath: `${path.basename(dir)}/${file}`,
      frontmatter,
      body: parsed.content.trim(),
    });
  }
  return out;
}

function startSortKey(start: string) {
  return start === "present" ? "9999-99" : start;
}

export async function loadKb(rootDir: string): Promise<Kb> {
  const stat = await fs.stat(rootDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`KB: root directory does not exist: ${rootDir}`);
  }

  const [profile, skills, education, publicContact, experience, projects] = await Promise.all([
    readYamlFile(path.join(rootDir, "profile.yaml"), ProfileSchema, "profile.yaml"),
    readYamlFile(path.join(rootDir, "skills.yaml"), SkillsSchema, "skills.yaml"),
    readYamlFile(path.join(rootDir, "education.yaml"), EducationSchema, "education.yaml"),
    readYamlFile(path.join(rootDir, "public-contact.yaml"), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience"),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects"),
  ]);

  experience.sort((a, b) => (startSortKey(a.frontmatter.start) < startSortKey(b.frontmatter.start) ? 1 : -1));
  projects.sort((a, b) => (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0));

  return { profile, skills, education, publicContact, experience, projects };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/lib/kb/loader.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/kb/loader.ts tests/lib/kb/loader.test.ts tests/fixtures/kb/
git commit -m "feat(kb): add loader that reads + validates the KB directory"
```

---

## Task 4: KB assembler

Takes the loaded KB and produces a single canonical text blob — this is what gets injected into the system prompt with prompt caching.

**Files:**
- Create: `lib/kb/assembler.ts`
- Create: `tests/lib/kb/assembler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/assembler.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { assembleKbText } from "@/lib/kb/assembler";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("assembleKbText", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("includes a top-level profile section with name and headline", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Profile");
    expect(text).toContain("Test Person");
    expect(text).toContain("Test headline");
  });

  it("includes skills with level and years", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Skills");
    expect(text).toContain("TypeScript");
    expect(text).toMatch(/TypeScript[^\n]*level: 5[^\n]*years: 10/);
  });

  it("includes one section per experience entry with file ref", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Experience");
    expect(text).toContain("## Fixture Co — Engineer (2024-01 → present)");
    expect(text).toContain("[ref: experience/2024-fixture-co.md]");
    expect(text).toContain("Fixture body.");
  });

  it("includes one section per project entry with file ref", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Projects");
    expect(text).toContain("## Fixture Project (2025)");
    expect(text).toContain("[ref: projects/fixture-project.md]");
  });

  it("includes education and public contact sections", () => {
    const text = assembleKbText(kb);
    expect(text).toContain("# Education");
    expect(text).toContain("Test University");
    expect(text).toContain("# Public contact");
    expect(text).toContain("test@example.com");
  });

  it("is deterministic — same input produces same output", () => {
    expect(assembleKbText(kb)).toBe(assembleKbText(kb));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/kb/assembler.test.ts
```

Expected: FAIL — module `@/lib/kb/assembler` cannot be found.

- [ ] **Step 3: Implement the assembler**

Create `lib/kb/assembler.ts`:
```typescript
import type { Kb } from "./loader";

export function assembleKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));

  return sections.join("\n\n");
}

function renderProfile(kb: Kb): string {
  const { profile } = kb;
  const lines = [`# Profile`, ``, `Name: ${profile.name}`, `Headline: ${profile.headline}`];
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages?.length) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.links) {
    for (const [k, v] of Object.entries(profile.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderSkills(kb: Kb): string {
  const lines = [`# Skills`, ``];
  for (const skill of kb.skills.skills) {
    const tags = skill.tags?.length ? ` (tags: ${skill.tags.join(", ")})` : "";
    lines.push(`- ${skill.name} — level: ${skill.level}/5, years: ${skill.years}${tags}`);
  }
  return lines.join("\n");
}

function renderEducation(kb: Kb): string {
  const lines = [`# Education`, ``];
  for (const e of kb.education.entries) {
    const notes = e.notes ? ` — ${e.notes}` : "";
    lines.push(`- ${e.institution}, ${e.degree} (${e.start} → ${e.end})${notes}`);
  }
  return lines.join("\n");
}

function renderPublicContact(kb: Kb): string {
  const lines = [`# Public contact`, ``];
  if (kb.publicContact.email) lines.push(`Email: ${kb.publicContact.email}`);
  if (kb.publicContact.links) {
    for (const [k, v] of Object.entries(kb.publicContact.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderExperience(kb: Kb): string {
  const lines = [`# Experience`, ``];
  for (const e of kb.experience) {
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
    lines.push(``);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/lib/kb/assembler.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/assembler.ts tests/lib/kb/assembler.test.ts
git commit -m "feat(kb): assemble loaded KB into a canonical text blob"
```

---

## Task 5: Citation builder

Defines the citation format the agent emits, and provides a function that converts a citation token into a GitHub URL for display.

**Files:**
- Create: `lib/kb/citations.ts`
- Create: `tests/lib/kb/citations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kb/citations.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseCitations, citationToUrl } from "@/lib/kb/citations";

describe("parseCitations", () => {
  it("extracts a single citation from text", () => {
    const text = "He founded Matrice in 2022 [^kb:experience/2022-matrice.md].";
    expect(parseCitations(text)).toEqual([
      { token: "[^kb:experience/2022-matrice.md]", path: "experience/2022-matrice.md", anchor: null },
    ]);
  });

  it("extracts citations with anchors", () => {
    const text = "Highlight A [^kb:experience/2022-matrice.md#highlights].";
    expect(parseCitations(text)).toEqual([
      { token: "[^kb:experience/2022-matrice.md#highlights]", path: "experience/2022-matrice.md", anchor: "highlights" },
    ]);
  });

  it("extracts multiple citations", () => {
    const text = "A [^kb:profile.yaml] and B [^kb:projects/x.md#summary] and C [^kb:skills.yaml].";
    const cites = parseCitations(text);
    expect(cites.map((c) => c.path)).toEqual(["profile.yaml", "projects/x.md", "skills.yaml"]);
    expect(cites[1].anchor).toBe("summary");
  });

  it("returns an empty array when no citations are present", () => {
    expect(parseCitations("plain text")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    expect(parseCitations("[^kb:]")).toEqual([]);
    expect(parseCitations("[^kb:../escape.md]")).toEqual([]); // no `..` allowed
  });
});

describe("citationToUrl", () => {
  it("builds a GitHub blob URL for a path without anchor", () => {
    const url = citationToUrl(
      { token: "x", path: "experience/2022-matrice.md", anchor: null },
      { repoUrl: "https://github.com/owner/repo", branch: "main" },
    );
    expect(url).toBe("https://github.com/owner/repo/blob/main/kb/experience/2022-matrice.md");
  });

  it("appends an anchor when present", () => {
    const url = citationToUrl(
      { token: "x", path: "experience/2022-matrice.md", anchor: "highlights" },
      { repoUrl: "https://github.com/owner/repo", branch: "main" },
    );
    expect(url).toBe("https://github.com/owner/repo/blob/main/kb/experience/2022-matrice.md#highlights");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/kb/citations.test.ts
```

Expected: FAIL — module `@/lib/kb/citations` cannot be found.

- [ ] **Step 3: Implement citations**

Create `lib/kb/citations.ts`:
```typescript
export type Citation = {
  token: string;
  path: string;
  anchor: string | null;
};

export type CitationConfig = {
  repoUrl: string;
  branch: string;
};

const CITATION_RE = /\[\^kb:([a-zA-Z0-9._/-]+\.(?:md|yaml))(#[a-zA-Z0-9_-]+)?\]/g;

export function parseCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const path = match[1];
    if (path.includes("..")) continue;
    out.push({
      token: match[0],
      path,
      anchor: match[2] ? match[2].slice(1) : null,
    });
  }
  return out;
}

export function citationToUrl(citation: Citation, config: CitationConfig): string {
  const base = `${config.repoUrl.replace(/\/$/, "")}/blob/${config.branch}/kb/${citation.path}`;
  return citation.anchor ? `${base}#${citation.anchor}` : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/lib/kb/citations.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/kb/citations.ts tests/lib/kb/citations.test.ts
git commit -m "feat(kb): add citation parsing and GitHub URL builder"
```

---

## Task 6: System prompt + prompt assembly

Writes the agent's system prompt as a Markdown file in `prompts/` (open-source, auditable) and a small loader that interpolates the assembled KB text into it.

**Files:**
- Create: `prompts/system.md`
- Create: `lib/prompts.ts`
- Create: `tests/lib/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/prompts.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildSystemPromptParts } from "@/lib/prompts";

describe("buildSystemPromptParts", () => {
  it("returns a header part and a kb part, header before kb", () => {
    const parts = buildSystemPromptParts({ kbText: "KB GOES HERE" });
    expect(parts).toHaveLength(2);
    expect(parts[0].kind).toBe("header");
    expect(parts[1].kind).toBe("kb");
  });

  it("the kb part contains the kb text verbatim", () => {
    const parts = buildSystemPromptParts({ kbText: "KB GOES HERE" });
    expect(parts[1].text).toContain("KB GOES HERE");
  });

  it("the header mentions third-person voice, FR+EN, citations, and the soft-extrapolation policy", () => {
    const parts = buildSystemPromptParts({ kbText: "" });
    const header = parts[0].text.toLowerCase();
    expect(header).toContain("third person");
    expect(header).toMatch(/french|fran[cç]ais/);
    expect(header).toContain("english");
    expect(header).toMatch(/cite|citation/);
    expect(header).toMatch(/extrapolat|infer/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/prompts.test.ts
```

Expected: FAIL — module `@/lib/prompts` cannot be found.

- [ ] **Step 3: Write the system prompt file**

Create `prompts/system.md`:
```markdown
# System prompt — Queryme agent

You are the public AI agent for Alexandre Collet. You answer questions from visitors (typically HR people, recruiters, hiring managers, and AI agents acting on their behalf) about Alexandre's professional background, experience, projects, skills, and how to reach him.

## Voice and language
- Speak in the **third person** about Alexandre ("Alexandre worked at…", not "I worked at…"). You are an assistant talking *about* him, not pretending to be him.
- Detect the asker's language from their first message and reply in the same language for the rest of the conversation. You fluently support **English** and **French (français)**. If asked in another language, reply in English and politely note the supported languages.
- Tone: warm, concise, professional. No emojis. No marketing fluff.

## Grounding policy
- The "Knowledge base" section below is the authoritative source of truth about Alexandre. Treat anything outside it as unknown unless it is a reasonable, low-confidence inference from what is there.
- You may extrapolate gently — for example, "given his Next.js experience, he is likely comfortable with React Server Components" — but you must flag it as inference ("likely", "probably", "based on adjacent experience…").
- Never invent specific facts: employer names, dates, titles, projects, metrics, awards, certifications, salaries, references, or contact details that are not in the knowledge base.
- If you don't know something, say so. Then proactively suggest related things you *do* know, and offer to forward the question to Alexandre directly. (The "forward to Alexandre" capability is not yet wired up in this version; phrase the offer as "I can pass this on to Alexandre — please reach out through his public contact, listed in the chat footer or under 'public contact' in the knowledge base.")

## Citations
- Every factual claim you make based on the knowledge base MUST be followed by a citation in this exact format:
  - `[^kb:<path>]` for a whole-file reference, e.g., `[^kb:experience/2022-matrice.md]`
  - `[^kb:<path>#<anchor>]` for a section reference where the anchor is a kebab-case slug of the section heading, e.g., `[^kb:experience/2022-matrice.md#highlights]`
- Place citations directly after the sentence or clause they support. Do not put them at the end of the message.
- Citations are mandatory for: dates, titles, company names, project names, technologies, metrics, quoted phrases.
- Citations are optional for: greetings, conversational filler, summaries of multiple things already cited.

## What you can and cannot disclose
- Everything in the knowledge base below is public. You can share all of it.
- This version of the agent does not have access to any sensitive information (salary expectations, references, private contact). If asked, say so and direct them to Alexandre's public contact details.

## Knowledge base

The complete knowledge base follows. Treat each `# <Section>` heading as authoritative. The `[ref: <path>]` markers tell you which file to cite for each entry.

---
```

- [ ] **Step 4: Implement the prompt builder**

Create `lib/prompts.ts`:
```typescript
import fs from "node:fs";
import path from "node:path";

export type SystemPromptPart =
  | { kind: "header"; text: string }
  | { kind: "kb"; text: string };

let cachedHeader: string | null = null;

function readHeader(): string {
  if (cachedHeader !== null) return cachedHeader;
  const file = path.resolve(process.cwd(), "prompts/system.md");
  cachedHeader = fs.readFileSync(file, "utf8").trim();
  return cachedHeader;
}

export function buildSystemPromptParts(input: { kbText: string }): SystemPromptPart[] {
  return [
    { kind: "header", text: readHeader() },
    { kind: "kb", text: input.kbText },
  ];
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/lib/prompts.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add prompts/system.md lib/prompts.ts tests/lib/prompts.test.ts
git commit -m "feat: add public system prompt + prompt builder"
```

---

## Task 7: Answerer (Anthropic streaming + prompt caching)

The single shared `answer()` function. Calls Anthropic via the Vercel AI SDK with prompt caching on the KB section, returns a streaming `StreamTextResult`.

**Files:**
- Create: `lib/answerer.ts`
- Create: `tests/lib/answerer.test.ts`

> **NOTE for the implementing engineer:** the Vercel AI SDK Anthropic provider supports prompt caching via `providerOptions.anthropic.cacheControl` on a content block. The exact API may have shifted; verify against the current docs via `context7` (resolve library id `@ai-sdk/anthropic`) before finalizing. The structure below is correct for AI SDK 4.x / 5.x; if the field name has changed, update accordingly while keeping the test contract.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/answerer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { simulateReadableStream } from "ai";
import { answer } from "@/lib/answerer";

function makeMockModel(textChunks: string[]) {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
          ...textChunks.map((t) => ({ type: "text-delta" as const, id: "1", delta: t })),
          { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        ],
      }),
    }),
  });
}

describe("answer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("streams text chunks from the model", async () => {
    const model = makeMockModel(["Hello", " world"]);
    const result = await answer({
      messages: [{ role: "user", content: "Hi" }],
      kbText: "FAKE KB",
      model,
    });

    const text = await result.text;
    expect(text).toBe("Hello world");
  });

  it("sends the KB text as part of the system prompt", async () => {
    const calls: unknown[] = [];
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        calls.push(options);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({
      messages: [{ role: "user", content: "Hi" }],
      kbText: "MARKER_KB_CONTENT",
      model,
    }).then((r) => r.text);

    expect(JSON.stringify(calls)).toContain("MARKER_KB_CONTENT");
  });

  it("marks the KB content for prompt caching via providerOptions", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({
      messages: [{ role: "user", content: "Hi" }],
      kbText: "KB",
      model,
    }).then((r) => r.text);

    const serialised = JSON.stringify(captured);
    expect(serialised).toMatch(/cacheControl|cache_control/);
    expect(serialised).toContain("ephemeral");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/answerer.test.ts
```

Expected: FAIL — module `@/lib/answerer` cannot be found.

- [ ] **Step 3: Implement the answerer**

Create `lib/answerer.ts`:
```typescript
import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildSystemPromptParts } from "./prompts";

export type AnswerInput = {
  messages: ModelMessage[];
  kbText: string;
  model?: LanguageModel;
};

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export async function answer(input: AnswerInput) {
  const model = input.model ?? anthropic(DEFAULT_MODEL_ID);
  const parts = buildSystemPromptParts({ kbText: input.kbText });

  // Build a system message whose KB content block is marked for prompt caching.
  // Header is small and not cached separately; the large, stable KB block is.
  const systemMessage: ModelMessage = {
    role: "system",
    content: [
      { type: "text", text: parts[0].text },
      {
        type: "text",
        text: parts[1].text,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
    ],
  };

  return streamText({
    model,
    messages: [systemMessage, ...input.messages],
    temperature: 0.3,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/lib/answerer.test.ts
```

Expected: PASS — all 3 tests green.

If the test fails because the AI SDK uses a different field name for cache control, update both `lib/answerer.ts` and the test together to match the current API. Verify by reading `node_modules/@ai-sdk/anthropic/dist/index.d.ts` for the exported types.

- [ ] **Step 5: Commit**

```bash
git add lib/answerer.ts tests/lib/answerer.test.ts
git commit -m "feat: add streaming answerer with Anthropic prompt caching"
```

---

## Task 8: `/api/chat` route

Wraps `answer()` in a Next.js POST route that the chat UI calls via the AI SDK's `useChat`.

**Files:**
- Create: `app/api/chat/route.ts`

This route reads the real `kb/` directory at request time. For tests we'd want to inject a fixture KB; that's deferred until Plan 2 (we'll factor `loadKb` injection in then). For now we trust the loader and rely on integration testing via the dev server.

- [ ] **Step 1: Write the route**

Create `app/api/chat/route.ts`:
```typescript
import { NextRequest } from "next/server";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assembleKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";

// Use the Node runtime so we can read files from the repo at runtime.
export const runtime = "nodejs";

let cachedKbText: string | null = null;

async function getKbText(): Promise<string> {
  if (cachedKbText !== null) return cachedKbText;
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  cachedKbText = assembleKbText(kb);
  return cachedKbText;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: UIMessage[] };
  const kbText = await getKbText();

  const result = await answer({
    messages: convertToModelMessages(body.messages),
    kbText,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify the route compiles**

```bash
pnpm typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 3: Smoke-test via dev server (manual)**

Note: this requires a valid `ANTHROPIC_API_KEY` in `.env.local` AND the sample KB from Task 13. If Task 13 hasn't run yet, skip this step and come back after Task 13.

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local  # paste a real key
pnpm dev
```

In another terminal:
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"What is his most recent role?"}]}]}'
```

Expected: streaming SSE-like response containing text deltas. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): add /api/chat route wired to answerer"
```

---

## Task 9: Chat message renderer with citations

Renders a single assistant or user message. Assistant messages support Markdown, and `[^kb:...]` tokens are rewritten into superscript links to the GitHub repo.

**Files:**
- Create: `components/chat-message.tsx`
- Create: `tests/components/chat-message.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/chat-message.test.tsx`:
```typescript
/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "@/components/chat-message";

const REPO = "https://github.com/test/repo";
const BRANCH = "main";

describe("ChatMessage", () => {
  it("renders a user message as plain text", () => {
    render(
      <ChatMessage role="user" text="Hello there" repoUrl={REPO} branch={BRANCH} />,
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders an assistant message with markdown", () => {
    render(
      <ChatMessage
        role="assistant"
        text="**bold** and _italic_"
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("converts a citation token into a superscript link to the github file", () => {
    render(
      <ChatMessage
        role="assistant"
        text="He founded Matrice [^kb:experience/2022-matrice.md]."
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/test/repo/blob/main/kb/experience/2022-matrice.md",
    );
    expect(link.tagName).toBe("A");
    expect(link.closest("sup")).not.toBeNull();
  });

  it("preserves citation anchors in the href", () => {
    render(
      <ChatMessage
        role="assistant"
        text="See [^kb:experience/2022-matrice.md#highlights]."
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/test/repo/blob/main/kb/experience/2022-matrice.md#highlights",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/components/chat-message.test.tsx
```

Expected: FAIL — module `@/components/chat-message` cannot be found.

- [ ] **Step 3: Implement the component**

Create `components/chat-message.tsx`:
```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseCitations, citationToUrl, type Citation } from "@/lib/kb/citations";
import { cn } from "@/lib/utils";

export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  repoUrl: string;
  branch: string;
};

function rewriteCitations(text: string, repoUrl: string, branch: string): string {
  const cites = parseCitations(text);
  let i = 0;
  let out = text;
  for (const c of cites) {
    i += 1;
    const url = citationToUrl(c, { repoUrl, branch });
    // Replace the first remaining occurrence of this token with a markdown link inside <sup> tags.
    const replacement = `<sup>[\\[${i}\\]](${url})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}

export function ChatMessage({ role, text, repoUrl, branch }: ChatMessageProps) {
  const isAssistant = role === "assistant";
  const rendered = isAssistant ? rewriteCitations(text, repoUrl, branch) : text;

  return (
    <div
      className={cn(
        "max-w-prose rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isAssistant
          ? "self-start bg-[var(--color-muted)] text-[var(--color-foreground)]"
          : "self-end bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
      )}
    >
      {isAssistant ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                {children}
              </a>
            ),
          }}
        >
          {rendered}
        </ReactMarkdown>
      ) : (
        <p className="whitespace-pre-wrap">{text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Allow raw HTML for `<sup>` in react-markdown**

react-markdown ignores raw HTML by default. We need `rehype-raw` to allow our injected `<sup>` to render.

```bash
pnpm add rehype-raw
```

Update `components/chat-message.tsx` to use it. Replace the `<ReactMarkdown>` block with:
```typescript
import rehypeRaw from "rehype-raw";
// ...
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeRaw]}
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
        {children}
      </a>
    ),
  }}
>
  {rendered}
</ReactMarkdown>
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/components/chat-message.test.tsx
```

Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add components/chat-message.tsx tests/components/chat-message.test.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): chat message renderer with markdown + citation links"
```

---

## Task 10: Chat shell with `useChat`

The interactive chat component that uses the AI SDK's React hook, manages multi-turn state, and renders messages via `ChatMessage`.

**Files:**
- Create: `components/chat.tsx`

This is a client component. Behavior is tested manually in the dev server (interactive UI testing with mocked streaming responses is high-effort for low marginal value in v1).

- [ ] **Step 1: Implement the chat shell**

Create `components/chat.tsx`:
```typescript
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat-message";
import { cn } from "@/lib/utils";

export type ChatProps = {
  repoUrl: string;
  branch: string;
  intro: string;
  placeholder: string;
  sendLabel: string;
  startersTitle: string;
  starters: string[];
};

export function Chat({
  repoUrl,
  branch,
  intro,
  placeholder,
  sendLabel,
  startersTitle,
  starters,
}: ChatProps) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function messageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  return (
    <section className="flex h-[70vh] max-w-3xl flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <ChatMessage role="assistant" text={intro} repoUrl={repoUrl} branch={branch} />
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role === "user" ? "user" : "assistant"}
            text={messageText(m)}
            repoUrl={repoUrl}
            branch={branch}
          />
        ))}

        {messages.length === 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {startersTitle}
            </p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]",
                    "px-3 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
                  )}
                  onClick={() => submit(s)}
                  disabled={isBusy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="resize-none"
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <Button type="submit" disabled={isBusy || !input.trim()}>
          {sendLabel}
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/chat.tsx
git commit -m "feat(ui): chat shell using @ai-sdk/react useChat"
```

---

## Task 11: Starter chips component

Already inlined into `Chat` in Task 10. This task is intentionally empty — kept in the plan so the task list maps 1:1 to the file-structure section. Skip if you've completed Task 10 with starters inline.

- [ ] **Step 1: Confirm starters render in `Chat`**

Read `components/chat.tsx`. Confirm the starters block at the bottom of the message list. If you split starters into a separate component, that's fine — but make sure they still render when `messages.length === 0` and call `submit(s)` on click. No commit needed.

---

## Task 12: Page layout (hero + chat + transparency footer)

The actual `/` page. Pulls everything together with a small bilingual content module.

**Files:**
- Modify: `app/page.tsx`
- Create: `lib/language.ts` (UI string helper)
- Create: `components/language-toggle.tsx`

- [ ] **Step 1: Write the UI strings helper**

Create `lib/language.ts`:
```typescript
export type UiLang = "en" | "fr";

export const UI_STRINGS = {
  en: {
    headline: "Alexandre Collet — queryable CV",
    intro:
      "Hi — I'm an agent that can answer questions about Alexandre's background, experience, and projects. Ask me anything.",
    placeholder: "Ask a question…",
    send: "Send",
    startersTitle: "Try one of these",
    starters: [
      "What's his most recent role?",
      "What's his experience with AI?",
      "How do I contact him?",
    ],
    footer: {
      transparency: "Everything this agent knows is in the public repo.",
      systemPrompt: "View the system prompt",
      kb: "View the knowledge base",
      repo: "GitHub repo",
    },
  },
  fr: {
    headline: "Alexandre Collet — CV interrogeable",
    intro:
      "Bonjour — je suis un agent qui peut répondre à des questions sur le parcours, l'expérience et les projets d'Alexandre. Posez-moi vos questions.",
    placeholder: "Posez une question…",
    send: "Envoyer",
    startersTitle: "Essayez l'une de ces questions",
    starters: [
      "Quel est son poste le plus récent ?",
      "Quelle est son expérience en IA ?",
      "Comment le contacter ?",
    ],
    footer: {
      transparency: "Tout ce que cet agent sait est dans le dépôt public.",
      systemPrompt: "Voir le prompt système",
      kb: "Voir la base de connaissances",
      repo: "Dépôt GitHub",
    },
  },
} as const;
```

- [ ] **Step 2: Write the language toggle**

Create `components/language-toggle.tsx`:
```typescript
"use client";

import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";

export type LanguageToggleProps = {
  value: UiLang;
  onChange: (next: UiLang) => void;
};

export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[var(--color-border)] text-xs">
      {(["en", "fr"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={cn(
            "px-3 py-1 uppercase tracking-wide",
            value === lang
              ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the home page**

Replace `app/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Chat } from "@/components/chat";
import { LanguageToggle } from "@/components/language-toggle";
import { UI_STRINGS, type UiLang } from "@/lib/language";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const t = UI_STRINGS[lang];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.headline}</h1>
        <LanguageToggle value={lang} onChange={setLang} />
      </header>

      <Chat
        repoUrl={REPO_URL}
        branch={BRANCH}
        intro={t.intro}
        placeholder={t.placeholder}
        sendLabel={t.send}
        startersTitle={t.startersTitle}
        starters={[...t.starters]}
      />

      <footer className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
        <p>{t.footer.transparency}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={`${REPO_URL}/blob/${BRANCH}/prompts/system.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t.footer.systemPrompt}
          </a>
          <a
            href={`${REPO_URL}/tree/${BRANCH}/kb`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t.footer.kb}
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
            {t.footer.repo}
          </a>
        </div>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
pnpm build
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx lib/language.ts components/language-toggle.tsx
git commit -m "feat(ui): assemble home page with chat + bilingual UI + footer links"
```

---

## Task 13: Sample KB content

Adds a minimal real-looking KB so the chat has something to talk about on first run. Alexandre will edit these in place after deployment.

**Files:**
- Create: `kb/profile.yaml`
- Create: `kb/skills.yaml`
- Create: `kb/education.yaml`
- Create: `kb/public-contact.yaml`
- Create: `kb/experience/2022-matrice.md`
- Create: `kb/projects/queryme.md`

- [ ] **Step 1: Write `kb/profile.yaml`**

```yaml
name: Alexandre Collet
headline: Founder / CTO at Matrice Technologies
location: Paris, France
languages: [en, fr]
links:
  linkedin: https://www.linkedin.com/in/alexandrecollet/
  github: https://github.com/Miawousha
```

- [ ] **Step 2: Write `kb/skills.yaml`**

Placeholder skills — Alexandre to refine:
```yaml
skills:
  - name: TypeScript
    level: 5
    years: 10
    tags: [frontend, backend, fullstack]
  - name: React / Next.js
    level: 5
    years: 8
    tags: [frontend]
  - name: Python
    level: 4
    years: 8
    tags: [backend, data]
  - name: Postgres
    level: 4
    years: 8
    tags: [data]
  - name: AI / LLM application development
    level: 4
    years: 3
    tags: [ai]
```

- [ ] **Step 3: Write `kb/education.yaml`**

```yaml
entries:
  - institution: "[School name — to be filled in]"
    degree: "[Degree — to be filled in]"
    start: "2010-09"
    end: "2014-06"
```

- [ ] **Step 4: Write `kb/public-contact.yaml`**

```yaml
email: alex@matricetechnologies.com
links:
  linkedin: https://www.linkedin.com/in/alexandrecollet/
  github: https://github.com/Miawousha
```

- [ ] **Step 5: Write `kb/experience/2022-matrice.md`**

```markdown
---
company: Matrice Technologies
role: Founder / CTO
start: "2022-03"
end: present
location: Paris, France
stack: [TypeScript, Next.js, Python, Postgres, Vercel]
tags: [founder, ai, b2b]
---

## What we do
[One paragraph in Alexandre's own words — what Matrice does, who it serves, what it's known for.]

## Highlights
- [Shipped X to Y customers]
- [Reduced Z by N%]
- [Hired and led a team of N]

## Stories
### How we landed our first enterprise customer
[A few paragraphs of narrative the agent can quote/summarize.]
```

- [ ] **Step 6: Write `kb/projects/queryme.md`**

```markdown
---
name: Queryme
year: 2026
stack: [TypeScript, Next.js, Vercel AI SDK]
tags: [ai, open-source, personal]
url: https://github.com/Miawousha/queryme
---

## Summary
A queryable CV: a public knowledge base about Alexandre, served through a web chat and an MCP server so HR people and AI agents can ask questions and get grounded, cited answers. Built to be radically transparent — the KB, the system prompt, and the code are all open-source.

## Why it exists
Two reasons. First, recruiting workflows are increasingly delegated to AI agents; a static CV is a poor fit for that interface. Second, transparency about what an agent "knows" about you is a trust problem worth solving up front.
```

- [ ] **Step 7: Add a KB validation script**

Install tsx:
```bash
pnpm add -D tsx
```

Create `scripts/validate-kb.ts`:
```typescript
import path from "node:path";
import { loadKb } from "../lib/kb/loader";
import { assembleKbText } from "../lib/kb/assembler";

async function main() {
  const dir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(dir);
  const text = assembleKbText(kb);
  console.log(`OK — KB validates and assembles to ${text.length} chars.`);
  console.log(`  experience: ${kb.experience.length} entries`);
  console.log(`  projects:   ${kb.projects.length} entries`);
  console.log(`  skills:     ${kb.skills.skills.length} entries`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
```

Add to `package.json` scripts:
```json
{
  "scripts": {
    "validate:kb": "tsx scripts/validate-kb.ts"
  }
}
```

(Merge into the existing `scripts` block from Task 1.)

Run it:
```bash
pnpm validate:kb
```

Expected: `OK — KB validates and assembles to <N> chars.` with N > 1000.

- [ ] **Step 8: Wire validation into the build**

So that a malformed KB fails CI rather than 500'ing in prod, modify `package.json` to run validation before the Next.js build:

```json
{
  "scripts": {
    "build": "pnpm validate:kb && next build"
  }
}
```

Run `pnpm build` to confirm.

- [ ] **Step 9: Commit**

```bash
git add kb/ scripts/validate-kb.ts package.json pnpm-lock.yaml
git commit -m "feat(kb): seed initial KB content + validation script wired into build"
```

---

## Task 14: README

Tell the next person (Alexandre, contributors, curious HR) how this works.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:
````markdown
# Queryme

A queryable CV. The knowledge base about Alexandre Collet, the system prompt that drives the agent, and the code that serves both are all in this repo — nothing hidden, nothing puffed up.

Live: _coming soon_

## How it works

1. The KB lives in `/kb` as YAML files (structured facts) and Markdown files (narrative stories). One file per role and per project.
2. The system prompt lives in `/prompts/system.md`. It's plain Markdown — read it.
3. The Next.js app loads the KB at runtime, assembles it into a single text blob, and injects it into the system prompt with Anthropic prompt caching so every request after the first is cheap.
4. The web chat at `/` calls `/api/chat`, which calls a shared `answer()` function. (An MCP server interface is on the way and will call the same `answer()`.)

## Local development

Prereqs: Node 20+, pnpm, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Editing the knowledge base

The KB is just files. Edit them and commit; the agent picks up the new content on the next build.

- `kb/profile.yaml` — name, headline, location, links
- `kb/skills.yaml` — skills with self-rated level (1–5) and years
- `kb/education.yaml` — schools / degrees
- `kb/public-contact.yaml` — public email + links
- `kb/experience/*.md` — one file per role. Frontmatter has structured facts; body has narrative ("What we do", "Highlights", "Stories").
- `kb/projects/*.md` — one file per project, same shape.

Validation runs at build time (via Zod schemas in `lib/kb/schemas.ts`); a malformed file fails the build with a clear message.

## Editing the agent's behavior

Open `prompts/system.md`. Edit. Commit. The build picks it up. The point of having this in the public repo is that anyone can audit exactly how the agent is instructed.

## Testing

```bash
pnpm test          # unit tests
pnpm typecheck     # TS only
pnpm build         # full Next.js build
```

## Deployment

Push to a Vercel project linked to this repo. Set `ANTHROPIC_API_KEY` and (optionally) override `NEXT_PUBLIC_REPO_URL` / `NEXT_PUBLIC_REPO_BRANCH` if you've forked.

## What's NOT in this version

This is the foundation. Coming in later releases:

- Sensitive content (salary, references, private contact) behind verified-email identification
- Lead capture + admin panel
- MCP server endpoint for AI agents

## License

MIT.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README explaining how to run, edit, and deploy"
```

---

## Final verification

- [ ] **Step 1: Full check**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: all three succeed.

- [ ] **Step 2: Manual end-to-end smoke test**

```bash
# Make sure .env.local has a real ANTHROPIC_API_KEY
pnpm dev
```

Open http://localhost:3000.

Manual test checklist:
- Page loads with the bilingual header and starter chips.
- Clicking a starter chip submits the question and streams a response.
- Response contains at least one superscript citation linking to a GitHub file in `kb/`.
- Switching language to FR and asking a question gets a French reply.
- Asking something not in the KB ("What's his favorite color?") triggers an honest "I don't know" answer, optionally with related info.
- Multi-turn works — ask a follow-up that references the previous answer.

- [ ] **Step 3: Push**

```bash
git push origin main
```

The current commit is now the v1 chat MVP. Plan 2 (identification + sensitive content) starts from this baseline.

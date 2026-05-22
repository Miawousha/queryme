# KB Artifact Side-Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, conversation-aware knowledge-base side panel to queryme — a browsable list of every KB file with the conversation's cited files surfaced and highlighted, plus a format-aware viewer (markdown / yaml / html / pdf).

**Architecture:** `app/page.tsx` becomes a two-pane layout (chat left, `KbPanel` right, resizable divider). Two `nodejs` route handlers serve the KB to the browser: `GET /api/kb` (a manifest of every public KB file) and `GET /api/kb/file?path=…` (one file's content, whitelisted against the manifest — no path traversal). A `KbContext` shares two things between the chat and the panel: `citedPaths` (the ordered KB paths the agent has cited, derived from assistant messages) and `openFilePath` (the file shown in the viewer). Clicking a `[^kb:…]` citation in a chat message opens that file in the panel.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind v4, `react-markdown` + `remark-gfm` + `rehype-sanitize` (already deps), vitest. `pnpm` is the package manager.

**Starts from:** `main` (after the identification-removal plan merged).

**Conventions:**
- All paths relative to `/Users/alexandrecollet/queryme`; run commands from the repo root.
- TDD for pure logic and route validation: write the failing test, run it (red), implement, run it (green). UI components are verified by `pnpm typecheck` + `pnpm build` + manual dev-server checks — no React component test harness is added.
- After every task: `pnpm typecheck` passes, `pnpm test` passes, and from Task 4 onward `pnpm build` passes.
- Commit after each task with the exact message in the final step (it includes the `Co-Authored-By` trailer).
- Path alias `@/*` maps to the repo root. `kb/` is the knowledge-base directory at the repo root.
- The KB is immutable for a process lifetime — server-side loaders cache module-level, the same pattern as `app/api/chat/route.ts`'s `getPublicKbText`.

---

## File structure produced by this plan

```
queryme/
├── lib/kb/
│   ├── file-type.ts          # Task 1 — extension → KbFileType
│   ├── cited-paths.ts        # Task 2 — assistant texts → ordered cited paths
│   └── manifest.ts           # Task 3 — walk kb/ → KbFile[]
├── app/api/kb/
│   ├── route.ts              # Task 4 — GET: the manifest
│   └── file/route.ts         # Task 5 — GET ?path=: one file's content
├── components/kb/
│   ├── kb-context.tsx        # Task 6 — KbProvider + useKb()
│   ├── kb-viewer.tsx         # Task 7 — format-dispatched viewer
│   ├── kb-file-list.tsx      # Task 8 — file list with surfacing
│   └── kb-panel.tsx          # Task 9 — panel shell (list ↔ viewer, collapse)
├── app/page.tsx              # Task 10 — two-pane layout + KbProvider
├── components/chat.tsx       # Task 11 — derive citedPaths, pass onOpenArtifact
├── components/chat-message.tsx     # Task 11 — citation → panel-open button
├── components/streaming-message.tsx # Task 11 — thread onOpenArtifact
└── tests/lib/kb/, tests/app/api/kb/ # tests alongside the above
```

---

## Task 1: `lib/kb/file-type.ts` — file-type detection

A pure helper mapping a file path to one of the four artifact types.

**Files:**
- Create: `lib/kb/file-type.ts`
- Create: `tests/lib/kb/file-type.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/lib/kb/file-type.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { fileTypeFromPath } from "@/lib/kb/file-type";

describe("fileTypeFromPath", () => {
  it("detects markdown", () => {
    expect(fileTypeFromPath("experience/2025-altergo.md")).toBe("md");
  });
  it("detects yaml (.yaml and .yml)", () => {
    expect(fileTypeFromPath("profile.yaml")).toBe("yaml");
    expect(fileTypeFromPath("notes.yml")).toBe("yaml");
  });
  it("detects html (.html and .htm)", () => {
    expect(fileTypeFromPath("portfolio.html")).toBe("html");
    expect(fileTypeFromPath("legacy.htm")).toBe("html");
  });
  it("detects pdf", () => {
    expect(fileTypeFromPath("cv.pdf")).toBe("pdf");
  });
  it("is case-insensitive on the extension", () => {
    expect(fileTypeFromPath("CV.PDF")).toBe("pdf");
  });
  it("returns null for unknown or extensionless paths", () => {
    expect(fileTypeFromPath("notes.txt")).toBeNull();
    expect(fileTypeFromPath("README")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — confirm red**

```bash
pnpm test tests/lib/kb/file-type.test.ts
```
Expected: FAIL — cannot resolve `@/lib/kb/file-type`.

- [ ] **Step 3: Implement `lib/kb/file-type.ts`**

```typescript
/** The artifact formats the KB viewer can render. */
export type KbFileType = "md" | "yaml" | "html" | "pdf";

/**
 * Maps a file path to its `KbFileType`, or `null` if the extension is not a
 * supported artifact type.
 */
export function fileTypeFromPath(path: string): KbFileType | null {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "md") return "md";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "pdf") return "pdf";
  return null;
}
```

- [ ] **Step 4: Run it — confirm green**

```bash
pnpm test tests/lib/kb/file-type.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/file-type.ts tests/lib/kb/file-type.test.ts
git commit -m "$(printf 'feat(kb): file-type detection helper\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: `lib/kb/cited-paths.ts` — cited-path extraction

A pure helper that, given the assistant's message texts, returns the ordered, de-duplicated list of KB paths cited via `[^kb:…]` markers. This drives panel surfacing.

**Files:**
- Create: `lib/kb/cited-paths.ts`
- Create: `tests/lib/kb/cited-paths.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/lib/kb/cited-paths.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { extractCitedPaths } from "@/lib/kb/cited-paths";

describe("extractCitedPaths", () => {
  it("returns paths in first-seen order", () => {
    const texts = [
      "He worked at Altergo [^kb:experience/2025-altergo.md].",
      "His profile [^kb:profile.yaml] lists more.",
    ];
    expect(extractCitedPaths(texts)).toEqual([
      "experience/2025-altergo.md",
      "profile.yaml",
    ]);
  });

  it("de-duplicates a path cited more than once, keeping first position", () => {
    const texts = [
      "A [^kb:profile.yaml] then B [^kb:skills.yaml].",
      "Again [^kb:profile.yaml].",
    ];
    expect(extractCitedPaths(texts)).toEqual(["profile.yaml", "skills.yaml"]);
  });

  it("ignores an anchor when de-duplicating (path only)", () => {
    const texts = ["[^kb:profile.yaml#skills] and [^kb:profile.yaml#links]"];
    expect(extractCitedPaths(texts)).toEqual(["profile.yaml"]);
  });

  it("returns an empty array when there are no citations", () => {
    expect(extractCitedPaths(["plain text", ""])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — confirm red**

```bash
pnpm test tests/lib/kb/cited-paths.test.ts
```
Expected: FAIL — cannot resolve `@/lib/kb/cited-paths`.

- [ ] **Step 3: Implement `lib/kb/cited-paths.ts`**

```typescript
import { parseCitations } from "@/lib/kb/citations";

/**
 * Extracts the ordered, de-duplicated KB file paths cited across a set of
 * assistant message texts. Anchors (`#section`) are ignored — surfacing is
 * per-file. Order is first-seen.
 */
export function extractCitedPaths(assistantTexts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of assistantTexts) {
    for (const citation of parseCitations(text)) {
      if (!seen.has(citation.path)) {
        seen.add(citation.path);
        out.push(citation.path);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run it — confirm green**

```bash
pnpm test tests/lib/kb/cited-paths.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/cited-paths.ts tests/lib/kb/cited-paths.test.ts
git commit -m "$(printf 'feat(kb): cited-path extraction from assistant transcript\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: `lib/kb/manifest.ts` — KB file manifest

Walks the `kb/` directory and returns a typed list of every public artifact file. Excludes `kb/sensitive/` (untracked private files may still exist there on disk) and dotfiles.

**Files:**
- Create: `lib/kb/manifest.ts`
- Create: `tests/lib/kb/manifest.test.ts`

The test runs against the existing fixture KB at `tests/fixtures/kb/`, which contains `profile.yaml`, `skills.yaml`, `education.yaml`, `public-contact.yaml`, `experience/2024-fixture-co.md`, `projects/fixture-project.md`.

- [ ] **Step 1: Write the failing test** — `tests/lib/kb/manifest.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

describe("loadKbManifest", () => {
  let manifest: KbFile[];

  beforeAll(async () => {
    manifest = await loadKbManifest(FIXTURE_DIR);
  });

  it("includes every public yaml and markdown file, with paths relative to the kb dir", () => {
    const paths = manifest.map((f) => f.path).sort();
    expect(paths).toEqual([
      "education.yaml",
      "experience/2024-fixture-co.md",
      "profile.yaml",
      "projects/fixture-project.md",
      "public-contact.yaml",
      "skills.yaml",
    ]);
  });

  it("tags each file with its type", () => {
    const profile = manifest.find((f) => f.path === "profile.yaml");
    const exp = manifest.find((f) => f.path === "experience/2024-fixture-co.md");
    expect(profile?.type).toBe("yaml");
    expect(exp?.type).toBe("md");
  });

  it("gives every file a non-empty title", () => {
    for (const f of manifest) {
      expect(f.title.length).toBeGreaterThan(0);
    }
  });

  it("excludes the sensitive directory", () => {
    expect(manifest.some((f) => f.path.startsWith("sensitive/"))).toBe(false);
  });

  it("returns files sorted by path", () => {
    const paths = manifest.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
  });
});
```

- [ ] **Step 2: Run it — confirm red**

```bash
pnpm test tests/lib/kb/manifest.test.ts
```
Expected: FAIL — cannot resolve `@/lib/kb/manifest`.

- [ ] **Step 3: Implement `lib/kb/manifest.ts`**

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileTypeFromPath, type KbFileType } from "@/lib/kb/file-type";

export type KbFile = {
  /** Path relative to the kb directory, e.g. "experience/2025-altergo.md". */
  path: string;
  /** Human-readable title for the file list. */
  title: string;
  type: KbFileType;
};

/** Directory name under kb/ that is never exposed by the manifest. */
const EXCLUDED_DIR = "sensitive";

/** Humanizes a path's basename into a fallback title. */
function humanize(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  const stem = base.replace(/\.[^.]+$/, "");
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** For markdown, prefer the first `# Heading`; otherwise humanize the path. */
async function titleFor(absPath: string, relPath: string, type: KbFileType): Promise<string> {
  if (type === "md") {
    const text = await fs.readFile(absPath, "utf8");
    const heading = text.split("\n").find((line) => /^#\s+/.test(line));
    if (heading) return heading.replace(/^#\s+/, "").trim();
  }
  return humanize(relPath);
}

async function walk(dir: string, baseDir: string, out: KbFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(baseDir, abs) === EXCLUDED_DIR) continue;
      await walk(abs, baseDir, out);
      continue;
    }
    const rel = path.relative(baseDir, abs);
    const type = fileTypeFromPath(rel);
    if (!type) continue;
    out.push({ path: rel, title: await titleFor(abs, rel, type), type });
  }
}

/**
 * Walks `kbDir` and returns every public artifact file (yaml/md/html/pdf),
 * excluding the `sensitive/` directory and dotfiles. Sorted by path.
 */
export async function loadKbManifest(kbDir: string): Promise<KbFile[]> {
  const out: KbFile[] = [];
  await walk(kbDir, kbDir, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
```

- [ ] **Step 4: Run it — confirm green**

```bash
pnpm test tests/lib/kb/manifest.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/kb/manifest.ts tests/lib/kb/manifest.test.ts
git commit -m "$(printf 'feat(kb): KB file manifest loader\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: `GET /api/kb` — the manifest endpoint

Serves the KB manifest as JSON to the browser. The manifest is cached module-level (the KB is immutable per process).

**Files:**
- Create: `app/api/kb/route.ts`

- [ ] **Step 1: Write `app/api/kb/route.ts`**

```typescript
import path from "node:path";
import { NextResponse } from "next/server";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

export const runtime = "nodejs";

const KB_DIR = path.resolve(process.cwd(), "kb");

// The KB is immutable for the process lifetime — load the manifest once.
let cached: KbFile[] | null = null;

async function getManifest(): Promise<KbFile[]> {
  if (cached) return cached;
  cached = await loadKbManifest(KB_DIR);
  return cached;
}

export async function GET(): Promise<Response> {
  try {
    const manifest = await getManifest();
    return NextResponse.json({ files: manifest });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck + build**

```bash
pnpm typecheck && pnpm build
```
Expected: typecheck clean; `next build` succeeds and lists `/api/kb` as a route.

- [ ] **Step 3: Commit**

```bash
git add app/api/kb/route.ts
git commit -m "$(printf 'feat(kb): GET /api/kb manifest endpoint\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: `GET /api/kb/file` — the file-content endpoint

Serves one KB file's content. The requested path is **whitelisted against the manifest** — if it is not an exact manifest entry, the route 404s. This makes path traversal impossible (no `..`, no absolute paths, no symlink escape — only known files are served).

**Files:**
- Create: `app/api/kb/file/route.ts`
- Create: `tests/app/api/kb/file/route.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/app/api/kb/file/route.test.ts`

This mirrors the existing `tests/app/api/` style (construct a `Request`, call the exported `GET`).

```typescript
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/kb/file/route";

function get(pathParam: string | null): Promise<Response> {
  const url = new URL("http://localhost/api/kb/file");
  if (pathParam !== null) url.searchParams.set("path", pathParam);
  // The route only reads `req.nextUrl`; a plain Request is structurally fine.
  return GET(new Request(url) as never);
}

describe("GET /api/kb/file", () => {
  it("400s when no path is given", async () => {
    expect((await get(null)).status).toBe(400);
  });

  it("404s a path-traversal attempt", async () => {
    expect((await get("../package.json")).status).toBe(404);
    expect((await get("../../etc/passwd")).status).toBe(404);
  });

  it("404s a path that is not in the manifest", async () => {
    expect((await get("does-not-exist.md")).status).toBe(404);
  });

  it("serves a real KB file with its content", async () => {
    // profile.yaml exists in the real kb/ directory.
    const res = await get("profile.yaml");
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — confirm red**

```bash
pnpm test tests/app/api/kb/file/route.test.ts
```
Expected: FAIL — cannot resolve `@/app/api/kb/file/route`.

- [ ] **Step 3: Implement `app/api/kb/file/route.ts`**

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import type { KbFileType } from "@/lib/kb/file-type";

export const runtime = "nodejs";

const KB_DIR = path.resolve(process.cwd(), "kb");

let cached: KbFile[] | null = null;
async function getManifest(): Promise<KbFile[]> {
  if (cached) return cached;
  cached = await loadKbManifest(KB_DIR);
  return cached;
}

const CONTENT_TYPE: Record<KbFileType, string> = {
  md: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
};

export async function GET(req: NextRequest): Promise<Response> {
  const requested = req.nextUrl.searchParams.get("path");
  if (!requested) {
    return NextResponse.json({ error: "A `path` query parameter is required." }, { status: 400 });
  }

  // Whitelist: the path must be an exact manifest entry. Anything else —
  // including traversal attempts — is rejected before touching the filesystem.
  const manifest = await getManifest();
  const entry = manifest.find((f) => f.path === requested);
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(path.join(KB_DIR, entry.path));
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": CONTENT_TYPE[entry.type],
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read the file." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run it — confirm green**

```bash
pnpm test tests/app/api/kb/file/route.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Verify typecheck + build**

```bash
pnpm typecheck && pnpm build
```
Expected: typecheck clean; build lists `/api/kb/file`.

- [ ] **Step 6: Commit**

```bash
git add app/api/kb/file/route.ts tests/app/api/kb/file/route.test.ts
git commit -m "$(printf 'feat(kb): GET /api/kb/file content endpoint (manifest-whitelisted)\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: `KbContext` — shared panel state

A React context shared by the chat and the panel. Holds the manifest (fetched once), `citedPaths` (written by the chat), and `openFilePath` (the file in the viewer).

**Files:**
- Create: `components/kb/kb-context.tsx`

- [ ] **Step 1: Write `components/kb/kb-context.tsx`**

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { KbFile } from "@/lib/kb/manifest";

type KbContextValue = {
  /** Every public KB file. Empty until the manifest fetch resolves. */
  manifest: KbFile[];
  /** Ordered KB paths the agent has cited so far this conversation. */
  citedPaths: string[];
  setCitedPaths: (paths: string[]) => void;
  /** The file currently shown in the viewer, or null for the file list. */
  openFilePath: string | null;
  openFile: (path: string) => void;
  closeFile: () => void;
};

const KbContext = createContext<KbContextValue | null>(null);

export function useKb(): KbContextValue {
  const ctx = useContext(KbContext);
  if (!ctx) throw new Error("useKb must be used within <KbProvider>");
  return ctx;
}

export function KbProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<KbFile[]>([]);
  const [citedPaths, setCitedPaths] = useState<string[]>([]);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kb")
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((data: { files?: KbFile[] }) => {
        if (!cancelled) setManifest(data.files ?? []);
      })
      .catch(() => {
        /* manifest stays empty — the panel shows an empty state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFile = useCallback((path: string) => setOpenFilePath(path), []);
  const closeFile = useCallback(() => setOpenFilePath(null), []);

  const value = useMemo(
    () => ({ manifest, citedPaths, setCitedPaths, openFilePath, openFile, closeFile }),
    [manifest, citedPaths, openFilePath, openFile, closeFile],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```
Expected: clean (the provider is not yet mounted anywhere — that's fine, it compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add components/kb/kb-context.tsx
git commit -m "$(printf 'feat(kb): KbContext for shared panel state\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: `KbViewer` — the format-dispatched viewer

Renders one KB file by type: markdown via `react-markdown`, yaml as a code block, html in a sandboxed iframe, pdf in an iframe. Has a header (title, type chip, "open on GitHub" link, expand/focus toggle) and loading/error states.

**Files:**
- Create: `components/kb/kb-viewer.tsx`

- [ ] **Step 1: Write `components/kb/kb-viewer.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { KbFile } from "@/lib/kb/manifest";
import { cn } from "@/lib/utils";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

function fileUrl(path: string): string {
  return `/api/kb/file?path=${encodeURIComponent(path)}`;
}

export function KbViewer({ file, onBack }: { file: KbFile; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [focus, setFocus] = useState(false);

  // md and yaml are fetched as text and rendered inline; html and pdf are
  // loaded directly by an <iframe> from the file endpoint.
  const needsText = file.type === "md" || file.type === "yaml";

  useEffect(() => {
    setFocus(false);
  }, [file.path]);

  useEffect(() => {
    if (!needsText) return;
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(fileUrl(file.path))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("load failed"))))
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file.path, needsText]);

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  return (
    <div
      className={cn(
        "flex flex-col",
        focus
          ? "fixed inset-0 z-50 bg-[var(--color-background)] p-4 sm:p-8"
          : "h-full",
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the file list"
          className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
          style={{ letterSpacing: "0.2em" }}
        >
          ‹ files
        </button>
        <span className="truncate text-[13px] text-[var(--color-text-primary)]">
          {file.title}
        </span>
        <span
          className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
          style={{ letterSpacing: "0.16em" }}
        >
          {file.type}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <a
            href={`${REPO_URL.replace(/\/$/, "")}/blob/${BRANCH}/kb/${file.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ letterSpacing: "0.2em" }}
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={() => setFocus((v) => !v)}
            aria-label={focus ? "Exit focus mode" : "Expand to focus mode"}
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ letterSpacing: "0.2em" }}
          >
            {focus ? "minimize" : "expand"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pt-3">
        {error && (
          <p className="text-xs text-red-500">Couldn&apos;t load this file.</p>
        )}

        {needsText && !error && text === null && (
          <p className="text-xs text-[var(--color-text-tertiary)]">Loading…</p>
        )}

        {file.type === "md" && text !== null && (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {text}
            </ReactMarkdown>
          </div>
        )}

        {file.type === "yaml" && text !== null && (
          <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 font-mono text-[12px] leading-relaxed text-[var(--color-text-primary)]">
            {text}
          </pre>
        )}

        {file.type === "html" && (
          <iframe
            title={file.title}
            src={fileUrl(file.path)}
            sandbox=""
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)] bg-white"
          />
        )}

        {file.type === "pdf" && (
          <iframe
            title={file.title}
            src={fileUrl(file.path)}
            className="h-full min-h-[60vh] w-full rounded-lg border border-[var(--color-border)]"
          />
        )}
      </div>
    </div>
  );
}
```

> Implementation note: `prose-chat` is the existing markdown style class in `app/globals.css` (used by chat bubbles) — reusing it keeps KB markdown consistent with chat markdown. The `html` iframe uses `sandbox=""` (no script execution) — KB HTML is the repo owner's own content, but sandboxing is correct hygiene.

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/kb/kb-viewer.tsx
git commit -m "$(printf 'feat(kb): format-dispatched KB file viewer\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: `KbFileList` — the browsable list with surfacing

Renders every KB file. Files in `citedPaths` are sorted to the top in citation order under a "referenced here" divider and highlighted; the rest follow under an "all documents" divider, dimmer. Clicking a row opens the file.

**Files:**
- Create: `components/kb/kb-file-list.tsx`

- [ ] **Step 1: Write `components/kb/kb-file-list.tsx`**

```typescript
"use client";

import type { KbFile } from "@/lib/kb/manifest";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

function FileRow({
  file,
  cited,
  onOpen,
}: {
  file: KbFile;
  cited: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
        cited
          ? "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.06)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
      )}
    >
      {cited && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
        />
      )}
      <span
        className={cn(
          "truncate text-[13px]",
          cited ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
        )}
      >
        {file.title}
      </span>
      <span
        className="ml-auto shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.16em" }}
      >
        {file.type}
      </span>
    </button>
  );
}

export function KbFileList({
  manifest,
  citedPaths,
  onOpen,
}: {
  manifest: KbFile[];
  citedPaths: string[];
  onOpen: (path: string) => void;
}) {
  const citedSet = new Set(citedPaths);
  // Cited files first, in citation order; the rest follow in manifest order.
  const cited = citedPaths
    .map((p) => manifest.find((f) => f.path === p))
    .filter((f): f is KbFile => f !== undefined);
  const rest = manifest.filter((f) => !citedSet.has(f.path));

  if (manifest.length === 0) {
    return (
      <p className="px-1 text-xs text-[var(--color-text-tertiary)]">
        The knowledge base is unavailable.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cited.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL} style={{ letterSpacing: "0.24em" }}>
            Referenced in this conversation
          </span>
          {cited.map((f) => (
            <FileRow key={f.path} file={f} cited onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={LABEL} style={{ letterSpacing: "0.24em" }}>
          {cited.length > 0 ? "All documents" : "Knowledge base"}
        </span>
        {rest.map((f) => (
          <FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/kb/kb-file-list.tsx
git commit -m "$(printf 'feat(kb): browsable KB file list with conversation surfacing\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 9: `KbPanel` — the panel shell

Assembles the list and the viewer: shows the file list, or the viewer when a file is open (with back-to-list). Reads everything from `useKb()`.

**Files:**
- Create: `components/kb/kb-panel.tsx`

- [ ] **Step 1: Write `components/kb/kb-panel.tsx`**

```typescript
"use client";

import { useKb } from "@/components/kb/kb-context";
import { KbFileList } from "@/components/kb/kb-file-list";
import { KbViewer } from "@/components/kb/kb-viewer";

export function KbPanel() {
  const { manifest, citedPaths, openFilePath, openFile, closeFile } = useKb();
  const openFileEntry = openFilePath
    ? manifest.find((f) => f.path === openFilePath) ?? null
    : null;

  return (
    <aside className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-baseline gap-2 border-b border-[var(--color-border)] pb-2">
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          knowledge base
        </span>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          {manifest.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {openFileEntry ? (
          <KbViewer file={openFileEntry} onBack={closeFile} />
        ) : openFilePath ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            That document isn&apos;t in the knowledge base.
          </p>
        ) : (
          <KbFileList manifest={manifest} citedPaths={citedPaths} onOpen={openFile} />
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/kb/kb-panel.tsx
git commit -m "$(printf 'feat(kb): KbPanel shell wiring list and viewer\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 10: Two-pane layout in `app/page.tsx`

Wrap the page in `<KbProvider>` and lay out chat + panel as a resizable horizontal split on desktop; on mobile the panel becomes a slide-over drawer toggled from the header.

**Files:**
- Modify: `app/page.tsx`
- Create: `components/kb/kb-layout.tsx`

The split logic (resizable divider, collapse, mobile drawer) is its own client component so `app/page.tsx` stays declarative.

- [ ] **Step 1: Write `components/kb/kb-layout.tsx`**

```typescript
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const WIDTH_KEY = "queryme:kbPanelWidth";
const MIN_PCT = 24;
const MAX_PCT = 60;
const DEFAULT_PCT = 38;

/**
 * Two-pane layout: `chat` on the left, `panel` on the right.
 * Desktop (>= sm): a draggable divider sets the panel width (persisted); the
 * panel collapses to a rail. Mobile: single column, the panel is a slide-over
 * drawer toggled by the floating button.
 */
export function KbLayout({ chat, panel }: { chat: ReactNode; panel: ReactNode }) {
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (stored >= MIN_PCT && stored <= MAX_PCT) setWidthPct(stored);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pct = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, pct));
      setWidthPct(clamped);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      setWidthPct((w) => {
        localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
        return w;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <>
      {/*
        `chat` is rendered EXACTLY ONCE — it owns a `useChat` instance, so a
        second mount would create a second conversation. `panel` is stateless
        (it reads `KbContext`); rendering it in both the desktop pane and the
        mobile drawer is a harmless minor duplication.
      */}
      <div className="flex min-h-0 flex-1">
        {/* Chat — single instance, in flow on every breakpoint. */}
        <div className="min-w-0 flex-1">{chat}</div>

        {/* Desktop KB pane (>= sm only). */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Show the knowledge base panel"
            className="ml-2 hidden w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] sm:flex"
            style={{ writingMode: "vertical-rl", letterSpacing: "0.3em" }}
          >
            KB
          </button>
        ) : (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.userSelect = "none";
              }}
              className="mx-1 hidden w-1 shrink-0 cursor-col-resize rounded-full bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] sm:block"
            />
            <div
              className="hidden shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 sm:block"
              style={{ width: `${widthPct}%` }}
            >
              <div className="flex h-full flex-col">
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse the knowledge base panel"
                  className="mb-2 self-end font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
                  style={{ letterSpacing: "0.2em" }}
                >
                  collapse ›
                </button>
                <div className="min-h-0 flex-1">{panel}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile drawer trigger (< sm only). */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-30 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 font-mono text-[10px] uppercase text-[var(--color-text-secondary)] shadow-lg sm:hidden"
        style={{ letterSpacing: "0.2em" }}
      >
        KB
      </button>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/50 sm:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full w-[88%] max-w-sm overflow-auto border-l border-[var(--color-border)] bg-[var(--color-background)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close the knowledge base panel"
              className="mb-2 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
              style={{ letterSpacing: "0.2em" }}
            >
              close ›
            </button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Modify `app/page.tsx`**

Read the current `app/page.tsx`. Make these changes:
1. Add imports: `import { KbProvider } from "@/components/kb/kb-context";`, `import { KbPanel } from "@/components/kb/kb-panel";`, `import { KbLayout } from "@/components/kb/kb-layout";`.
2. Wrap the page body in `<KbProvider>`.
3. Replace the single-column `<Chat … />` placement with `<KbLayout chat={<Chat … />} panel={<KbPanel />} />`.
4. The `<main>` currently has `max-w-3xl`. For the two-pane layout, widen it — change `max-w-3xl` to `max-w-6xl` and ensure `<main>` is a flex column that lets the layout fill height: it already is `flex min-h-screen flex-col gap-8`. The `KbLayout`'s desktop branch uses `sm:flex-1` / `min-h-0`, so the chat + panel share the row height.

Concretely, the returned JSX becomes (keep the existing `<GridBackground/>`, header, and footer exactly as they are; only the middle changes):

```tsx
return (
  <KbProvider>
    <GridBackground />
    <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
      {/* …existing <header> unchanged… */}

      <KbLayout
        chat={
          <Chat
            repoUrl={REPO_URL}
            branch={BRANCH}
            intro={t.intro}
            placeholder={t.placeholder}
            sendLabel={t.send}
            startersTitle={t.startersTitle}
            starters={[...t.starters]}
          />
        }
        panel={<KbPanel />}
      />

      {/* …existing <footer> unchanged… */}
    </main>
  </KbProvider>
);
```

Keep `REPO_URL`, `BRANCH`, `lang`, `t`, `mcpOpen`, the `<McpModal/>`, and `FooterLink` exactly as they are. The `<McpModal/>` stays at the end inside `<KbProvider>`.

- [ ] **Step 3: Verify typecheck + build**

```bash
pnpm typecheck && pnpm build
```
Expected: clean; build succeeds.

- [ ] **Step 4: Manual smoke test**

```bash
pnpm dev
```
Open `http://localhost:3000`. Expected: chat on the left, KB panel on the right showing the file list (every `kb/` file). The divider drags and resizes; collapse hides the panel to a rail; clicking a file opens the viewer; the back control returns to the list. Narrow the window below `sm` — the panel becomes a drawer behind a floating "KB" button. Stop the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/kb/kb-layout.tsx
git commit -m "$(printf 'feat(kb): two-pane layout with the KB side panel\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 11: Citation integration — citations open the panel

Wire the chat to the panel: `<Chat>` derives `citedPaths` from its messages and writes them to `KbContext`; a `[^kb:…]` citation in an assistant message becomes a button that opens that file in the panel.

**Files:**
- Modify: `components/chat-message.tsx`
- Modify: `components/streaming-message.tsx`
- Modify: `components/chat.tsx`

- [ ] **Step 1: Modify `components/chat-message.tsx`**

Read the file. Make these changes:

1. `rewriteCitations` currently builds a GitHub URL. Change it so the citation superscript links to an internal `kb://<path>` URL instead — it no longer needs `repoUrl`/`branch`:

```typescript
function rewriteCitations(text: string): string {
  const cites = parseCitations(text);
  let i = 0;
  let out = text;
  for (const c of cites) {
    i += 1;
    // `kb://<path>` is an internal sentinel — the `a` renderer below turns it
    // into a button that opens the file in the KB panel.
    const replacement = `<sup>[\\[${i}\\]](kb://${c.path})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}
```

2. The `sanitizeSchema` must allow the `kb` URL protocol on `href` (otherwise `rehype-sanitize` strips it). Update `sanitizeSchema`:

```typescript
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sup"],
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "kb"],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), ["target"], ["rel"]],
  },
};
```

3. `ChatMessageProps`: remove `repoUrl` and `branch`; add `onOpenArtifact?: (path: string) => void`. New props:

```typescript
export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  onForward?: (question: string) => void;
  onOpenArtifact?: (path: string) => void;
};
```

4. In the component signature, destructure `onOpenArtifact` instead of `repoUrl`/`branch`; `rewriteCitations` is now called as `rewriteCitations(text)`.

5. In the `ReactMarkdown` `components` map, replace the `a` renderer so a `kb://` href becomes a citation button, and other links stay external anchors:

```tsx
components={{
  a: ({ href, children }) => {
    if (href?.startsWith("kb://")) {
      const path = href.slice("kb://".length);
      return (
        <button
          type="button"
          onClick={() => onOpenArtifact?.(path)}
          className="kb-citation"
        >
          {children}
        </button>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
}}
```

6. Add a `.kb-citation` style. In `app/globals.css`, under the `.prose-chat sup a` rule, add:

```css
.prose-chat sup .kb-citation {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.7em;
  color: var(--color-accent);
}
```

- [ ] **Step 2: Modify `components/streaming-message.tsx`**

`StreamingMessageProps` is `Omit<ChatMessageProps, "text"> & { text; isStreaming }`. Since `ChatMessageProps` lost `repoUrl`/`branch` and gained `onOpenArtifact`, no structural change is needed — but verify the file does not itself reference `repoUrl`/`branch`. If it spreads `...rest` into `<ChatMessage>`, it already forwards `onOpenArtifact` automatically. Confirm it typechecks; make no change unless the compiler flags one.

- [ ] **Step 3: Modify `components/chat.tsx`**

Read the file. Make these changes:

1. Add imports: `import { useKb } from "@/components/kb/kb-context";` and `import { extractCitedPaths } from "@/lib/kb/cited-paths";` (plus `useEffect` is already imported).

2. Inside the `Chat` component, get the context: `const { setCitedPaths, openFile } = useKb();`.

3. After `messages` is available, derive cited paths and push them to the context whenever messages change:

```tsx
useEffect(() => {
  const assistantTexts = messages
    .filter((m) => m.role !== "user")
    .map((m) => messageText(m));
  setCitedPaths(extractCitedPaths(assistantTexts));
}, [messages, setCitedPaths]);
```

(Place this after the `messageText` function is defined, or hoist `messageText` above it — `messageText` is a plain function declaration so it is hoisted; the effect can reference it.)

4. The `repoUrl` / `branch` props on `<ChatMessage>` and `<StreamingMessage>` no longer exist. Update both render sites:
   - The intro `<ChatMessage role="assistant" text={intro} repoUrl={repoUrl} branch={branch} />` becomes `<ChatMessage role="assistant" text={intro} />`.
   - The mapped `<StreamingMessage … repoUrl={repoUrl} branch={branch} … />` drops those two props and adds `onOpenArtifact={openFile}`.

5. `ChatProps` still has `repoUrl` / `branch` — they are no longer used inside `Chat` (the message components dropped them). Remove `repoUrl` and `branch` from `ChatProps` and from the destructured parameters, and remove them from the `<Chat … />` call site in `app/page.tsx` (Task 10 passed them — delete those two props there too). The KB viewer reads the repo URL from `NEXT_PUBLIC_*` env directly, so nothing else needs them. `app/page.tsx` keeps `REPO_URL`/`BRANCH` only for the footer `FooterLink`s.

- [ ] **Step 4: Verify typecheck + test + build**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all green.

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```
Ask the agent a question that produces a citation (e.g. "What is his most recent role?"). Expected: the answer's `[1]`-style citation superscript is clickable; clicking it opens that KB file in the panel viewer, and the file appears highlighted under "Referenced in this conversation" in the list. Stop the dev server afterward.

- [ ] **Step 6: Commit**

```bash
git add components/chat-message.tsx components/streaming-message.tsx components/chat.tsx app/page.tsx app/globals.css
git commit -m "$(printf 'feat(kb): citations open the cited file in the KB panel\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Task 12: Final verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a KB-panel note to `README.md`**

Open `README.md`. In the section describing the web experience (near the chat description), add a short paragraph:

```markdown
### Knowledge-base panel

Alongside the chat, a side panel lists every file in the public knowledge base.
As the agent cites sources, those files are surfaced to the top of the list and
highlighted; clicking a citation in an answer opens that file in an in-app
viewer (markdown, YAML, HTML, and PDF are supported). The panel is resizable and
collapsible, and becomes a drawer on small screens.
```

Place it where it reads naturally next to the existing chat / MCP descriptions.

- [ ] **Step 2: Run the full verification gate**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: typecheck clean; the entire suite passes (the Plan suite plus the new KB tests — `file-type` 6, `cited-paths` 4, `manifest` 5, `api/kb/file` 4); `pnpm build` succeeds and lists `/api/kb` and `/api/kb/file` as routes.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(printf 'docs(kb): document the knowledge-base side panel\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
```

---

## Plan complete

End state: queryme's home page is a two-pane workspace — chat on the left, a browsable knowledge-base panel on the right. The panel lists every public KB file; as the agent cites sources, the cited files surface to the top and highlight, and clicking a citation opens that file in a format-aware viewer (markdown, YAML, HTML, PDF) with a focus mode. The KB is served to the browser by two manifest-whitelisted endpoints with no path-traversal surface. All pure logic is unit-tested; typecheck, the test suite, and the production build pass.

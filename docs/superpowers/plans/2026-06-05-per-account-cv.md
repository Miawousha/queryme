# Public Per-Account CV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every account a public CV (in-panel + standalone printable route) scoped to its own KB, reachable at `/{username}/cv` on the platform domain and at `/cv` on its custom domain, while the featured/root account keeps its house URLs (`/cv`, `/api/cv`).

**Architecture:** One shared CV core (`lib/cv/load.ts` → `loadCvKb`) that runs the privacy filter once; thin per-surface wrappers (root + per-account) for the data API and the standalone page; the in-panel CV ungated for all accounts and parameterized via `KbContext` (`apiBasePath` + a new `cvPrintBase`); middleware extended to vanity-host `/cv`.

**Tech Stack:** Next.js App Router (RSC + route handlers), TypeScript, Vitest + jsdom, Drizzle, Zod.

**Spec:** `docs/superpowers/specs/2026-06-05-per-account-cv-design.md`

**Before starting:** create a feature branch off `main` (e.g. `git switch -c per-account-cv`). The repo's privacy fix to `lib/kb/cv-config.ts` (public-repos-only `filterKbForCv`) is assumed already present — the shared loader depends on it.

---

### Task 1: Shared CV loader (`lib/cv/load.ts`)

**Files:**
- Create: `lib/cv/load.ts`
- Test: `tests/lib/cv/load.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/cv/load.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Kb } from "@/lib/kb/loader";
import type { Repo } from "@/lib/kb/schemas";

const ensureReady = vi.fn();
const getRoot = vi.fn();
const loadKb = vi.fn();

vi.mock("@/lib/persona/store", () => ({ getPersonaStore: () => ({ ensureReady, getRoot }) }));
vi.mock("@/lib/kb/loader", () => ({ loadKb }));
vi.mock("@/lib/persona", () => ({ loadPersona: () => ({ fullName: "Ada Lovelace" }) }));

function kbWithRepos(repos: Repo[]): Kb {
  return {
    profile: { name: "Ada", headline: "Dev" },
    skills: { skills: [] },
    education: { entries: [] },
    publicContact: {},
    experience: [],
    projects: [{ slug: "p", relativePath: "projects/p.md", frontmatter: { name: "p", repos }, body: "" }],
    talks: [],
    recommendations: [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("loadCvKb", () => {
  it("returns null when the account has no content root", async () => {
    ensureReady.mockResolvedValue(undefined);
    getRoot.mockReturnValue(null);
    const { loadCvKb } = await import("@/lib/cv/load");
    expect(await loadCvKb("acc", "en")).toBeNull();
  });

  it("strips private repos through filterKbForCv (the privacy chokepoint)", async () => {
    ensureReady.mockResolvedValue(undefined);
    // A dir with no cv-config.yaml → loadCvConfig returns null → unconditional repo filter still runs.
    getRoot.mockReturnValue("/tmp/per-account-cv-no-config");
    loadKb.mockResolvedValue(
      kbWithRepos([
        { name: "pub", role: "author", visibility: "public", url: "https://x/pub" },
        { name: "secret", role: "author", visibility: "private", url: "https://x/secret" },
      ]),
    );
    const { loadCvKb } = await import("@/lib/cv/load");
    const result = await loadCvKb("acc", "en");
    expect(result).not.toBeNull();
    expect((result!.cvKb.projects[0].frontmatter.repos ?? []).map((r) => r.name)).toEqual(["pub"]);
  });

  it("returns the persona full name via cvPersonaName", async () => {
    ensureReady.mockResolvedValue(undefined);
    getRoot.mockReturnValue("/tmp/per-account-cv-no-config");
    const { cvPersonaName } = await import("@/lib/cv/load");
    expect(await cvPersonaName("acc")).toBe("Ada Lovelace");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/cv/load.test.ts`
Expected: FAIL — cannot resolve module `@/lib/cv/load`.

- [ ] **Step 3: Write the implementation**

Create `lib/cv/load.ts`:

```ts
import path from "node:path";
import { loadKb, type KbLang, type Kb } from "@/lib/kb/loader";
import { filterKbForCv, loadCvConfig } from "@/lib/kb/cv-config";
import { getPersonaStore } from "@/lib/persona/store";
import { loadPersona } from "@/lib/persona";

/**
 * Assemble the CV-filtered KB for an account. This is the single place every CV
 * surface (the /cv and /{username}/cv pages, /api/cv, /api/a/{username}/cv, and
 * the panel copy/download) goes through, so the privacy filter in
 * `filterKbForCv` (public repos only) runs exactly once and cannot be bypassed.
 * Returns null when the account has no configured content root.
 */
export async function loadCvKb(
  accountId: string,
  lang: KbLang,
): Promise<{ root: string; cvKb: Kb } | null> {
  const store = getPersonaStore();
  await store.ensureReady(accountId);
  const root = store.getRoot(accountId);
  if (!root) return null;
  const [kb, config] = await Promise.all([
    loadKb(path.join(root, "kb"), lang),
    loadCvConfig(root),
  ]);
  return { root, cvKb: filterKbForCv(kb, config) };
}

/** Persona full name for an account's CV `<title>`. Null when unconfigured. */
export async function cvPersonaName(accountId: string): Promise<string | null> {
  const store = getPersonaStore();
  await store.ensureReady(accountId);
  const root = store.getRoot(accountId);
  if (!root) return null;
  return loadPersona(root).fullName;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/cv/load.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cv/load.ts tests/lib/cv/load.test.ts
git commit -m "feat(cv): shared per-account CV loader (privacy chokepoint)"
```

---

### Task 2: CV data API — per-account route + refactor root route

**Files:**
- Create: `app/api/a/[username]/cv/route.ts`
- Modify: `app/api/cv/route.ts` (replace inline kb/config/filter with `loadCvKb`)
- Test: `tests/app/api/a/cv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/a/cv.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const loadAccountForSlug = vi.fn();
const loadCvKb = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadAccountForSlug }));
vi.mock("@/lib/cv/load", () => ({ loadCvKb }));

const ctx = (username: string) => ({ params: Promise.resolve({ username }) });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/a/[username]/cv", () => {
  it("404s for an unknown account slug", async () => {
    loadAccountForSlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/nope/cv"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(loadCvKb).not.toHaveBeenCalled();
  });

  it("returns the account-scoped cvKb for a known slug", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "acc-1", username: "alex" });
    loadCvKb.mockResolvedValue({ root: "/x", cvKb: { projects: [] } });
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/alex/cv?lang=fr"), ctx("alex"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lang).toBe("fr");
    expect(body.kb).toEqual({ projects: [] });
    expect(loadCvKb).toHaveBeenCalledWith("acc-1", "fr");
  });

  it("503s when the account has no configured content", async () => {
    loadAccountForSlug.mockResolvedValue({ id: "acc-1", username: "alex" });
    loadCvKb.mockResolvedValue(null);
    const { GET } = await import("@/app/api/a/[username]/cv/route");
    const res = await GET(new NextRequest("http://x/api/a/alex/cv"), ctx("alex"));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/api/a/cv.test.ts`
Expected: FAIL — cannot resolve `@/app/api/a/[username]/cv/route`.

- [ ] **Step 3: Create the per-account route**

Create `app/api/a/[username]/cv/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { loadCvKb } from "@/lib/cv/load";
import type { KbLang } from "@/lib/kb/loader";

export const runtime = "nodejs";

function parseLang(value: string | null): KbLang {
  return value === "fr" ? "fr" : "en";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const result = await loadCvKb(account.id, lang);
  if (!result) return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/app/api/a/cv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor the root route to share the loader**

Replace the entire contents of `app/api/cv/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { loadCvKb } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";
import type { KbLang } from "@/lib/kb/loader";

export const runtime = "nodejs";

function parseLang(value: string | null): KbLang {
  return value === "fr" ? "fr" : "en";
}

export async function GET(req: NextRequest) {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `npm run typecheck && npx vitest run tests/app/api/a/cv.test.ts`
Expected: typecheck clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/a/[username]/cv/route.ts app/api/cv/route.ts tests/app/api/a/cv.test.ts
git commit -m "feat(cv): per-account CV data API; root /api/cv uses shared loader"
```

---

### Task 3: Co-locate + parameterize the standalone print UI

Moves the CV-specific print UI into `components/cv/` and adds a `basePath` so the
top bar's links resolve per account. No behavior change for the root account yet.

**Files:**
- Move: `app/cv/cv-top-bar.tsx` → `components/cv/cv-top-bar.tsx` (then add `basePath`)
- Move: `app/cv/print.css` → `components/cv/print.css` (unchanged)
- Create: `components/cv/cv-standalone.tsx`

- [ ] **Step 1: Move the files**

```bash
git mv app/cv/cv-top-bar.tsx components/cv/cv-top-bar.tsx
git mv app/cv/print.css components/cv/print.css
```

- [ ] **Step 2: Add `basePath` to `CvTopBar`**

In `components/cv/cv-top-bar.tsx`, change the signature and the two links. Replace:

```tsx
export function CvTopBar({ lang, printLabel, backLabel }: { lang: UiLang; printLabel: string; backLabel: string }) {
```

with:

```tsx
export function CvTopBar({
  lang,
  printLabel,
  backLabel,
  basePath = "",
}: {
  lang: UiLang;
  printLabel: string;
  backLabel: string;
  /** Account page base: "" for the root account (→ /cv) or "/{username}". */
  basePath?: string;
}) {
```

Replace the back link `href`:

```tsx
      <Link
        href="/"
```

with:

```tsx
      <Link
        href={basePath || "/"}
```

Replace the language-toggle navigation:

```tsx
          onChange={(next) => {
            router.push(`/cv?lang=${next}`);
          }}
```

with:

```tsx
          onChange={(next) => {
            router.push(`${basePath}/cv?lang=${next}`);
          }}
```

- [ ] **Step 3: Create the shared standalone body**

Create `components/cv/cv-standalone.tsx`:

```tsx
import type { Kb, KbLang } from "@/lib/kb/loader";
import { CV_STRINGS } from "@/lib/cv/strings";
import { CvDocumentView } from "./cv-document";
import { CvTopBar } from "./cv-top-bar";
import "./print.css";

/**
 * Standalone printable CV page body, shared by the root `/cv` route and the
 * per-account `/{username}/cv` route. `basePath` is "" for the root account
 * (links resolve to `/cv`) or `/{username}` for a per-account CV.
 */
export function CvStandalone({
  cvKb,
  lang,
  basePath,
}: {
  cvKb: Kb;
  lang: KbLang;
  basePath: string;
}) {
  const t = CV_STRINGS[lang];
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CvTopBar lang={lang} printLabel={t.print} backLabel="queryme" basePath={basePath} />
      <CvDocumentView kb={cvKb} lang={lang} />
    </main>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: FAIL — `app/cv/page.tsx` still imports the moved `./cv-top-bar` and `./print.css`. This is expected; Task 4 rewrites that page. (If you want a green checkpoint first, do Task 4 before committing.)

- [ ] **Step 5: Commit (with Task 4)**

Commit this together with Task 4 so the tree typechecks. Proceed to Task 4.

---

### Task 4: Standalone CV pages — refactor root, add per-account

**Files:**
- Modify: `app/cv/page.tsx` (use `CvStandalone` + shared loader)
- Create: `app/[username]/cv/page.tsx`

- [ ] **Step 1: Rewrite the root page**

Replace the entire contents of `app/cv/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { loadCvKb, cvPersonaName } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { CvStandalone } from "@/components/cv/cv-standalone";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import type { KbLang } from "@/lib/kb/loader";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const name = await cvPersonaName(await resolveRootAccountId());
  if (!name) return { title: "CV" };
  return { title: `${name} — CV`, description: `Printable CV for ${name}.` };
}

function parseLang(value: string | string[] | undefined): KbLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fr" ? "fr" : "en";
}

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function CvPage({ searchParams }: Props) {
  const { lang: langParam } = await searchParams;
  const lang = parseLang(langParam);
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) return <NotConfiguredScreen />;
  return <CvStandalone cvKb={result.cvKb} lang={lang} basePath="" />;
}
```

- [ ] **Step 2: Create the per-account page**

Create `app/[username]/cv/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCvKb, cvPersonaName } from "@/lib/cv/load";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { CvStandalone } from "@/components/cv/cv-standalone";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import type { KbLang } from "@/lib/kb/loader";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return { title: "CV" };
  const name = await cvPersonaName(account.id);
  if (!name) return { title: "CV" };
  return { title: `${name} — CV`, description: `Printable CV for ${name}.` };
}

function parseLang(value: string | string[] | undefined): KbLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fr" ? "fr" : "en";
}

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function AccountCvPage({ params, searchParams }: Props) {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) notFound();
  const { lang: langParam } = await searchParams;
  const lang = parseLang(langParam);
  const result = await loadCvKb(account.id, lang);
  if (!result) return <NotConfiguredScreen />;
  return <CvStandalone cvKb={result.cvKb} lang={lang} basePath={`/${account.username}`} />;
}
```

- [ ] **Step 3: Verify typecheck + full tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS (no regressions).

- [ ] **Step 4: Commit (Tasks 3 + 4 together)**

```bash
git add app/cv/page.tsx app/[username]/cv/page.tsx components/cv/cv-standalone.tsx components/cv/cv-top-bar.tsx components/cv/print.css
git commit -m "feat(cv): standalone per-account CV page; share print UI via CvStandalone"
```

---

### Task 5: Make the in-panel CV account-aware

Threads the account's API base (already in context) and a new `cvPrintBase` to the
in-panel CV client components. No ungating yet — behavior for the root account is
unchanged; per-account is still hidden until Task 6.

**Files:**
- Modify: `components/kb/kb-context.tsx` (add `cvPrintBase`)
- Modify: `components/cv/cv-document-client.tsx` (fetch via `apiBasePath`)
- Modify: `components/cv/cv-panel-view.tsx` (fetch via `apiBasePath`, print via `cvPrintBase`)

- [ ] **Step 1: Add `cvPrintBase` to `KbContext`**

In `components/kb/kb-context.tsx`, add to the `KbContextValue` type (after the `apiBasePath` field):

```tsx
  /** Base path for KB API calls (e.g. "/api" or "/api/a/username"). */
  apiBasePath: string;
  /** Account page base for CV links: "" (→ /cv) or "/{username}". */
  cvPrintBase: string;
```

In the `KbProvider` signature, add the prop with a default:

```tsx
  apiBasePath = "/api",
  cvPrintBase = "",
  includeCv = true,
  children,
}: {
  lang: UiLang;
  kbStrings: KbStrings;
  /** Base path for KB API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** Account page base for CV links. Defaults to "" (→ /cv). */
  cvPrintBase?: string;
  /** Whether to prepend the synthetic CV entry. Defaults to true. */
  includeCv?: boolean;
  children: ReactNode;
}) {
```

Add `cvPrintBase` to the `value` memo object and its dependency array:

```tsx
      openFile,
      closeFile,
      apiBasePath,
      cvPrintBase,
    }),
    [lang, strings, manifestWithCv, citedPaths, openFilePath, openFile, closeFile, apiBasePath, cvPrintBase],
```

- [ ] **Step 2: Update `CvDocumentClient` to fetch via `apiBasePath`**

In `components/cv/cv-document-client.tsx`, add the import and read context. Replace:

```tsx
import { useEffect, useState } from "react";
import type { Kb, KbLang } from "@/lib/kb/loader";
import { CvDocumentView } from "./cv-document";
```

with:

```tsx
import { useEffect, useState } from "react";
import type { Kb, KbLang } from "@/lib/kb/loader";
import { useKb } from "@/components/kb/kb-context";
import { CvDocumentView } from "./cv-document";
```

Replace:

```tsx
export function CvDocumentClient({ lang }: { lang: KbLang }) {
  const [data, setData] = useState<CvPayload | null>(null);
  const [error, setError] = useState(false);
```

with:

```tsx
export function CvDocumentClient({ lang }: { lang: KbLang }) {
  const { apiBasePath } = useKb();
  const [data, setData] = useState<CvPayload | null>(null);
  const [error, setError] = useState(false);
```

Replace the fetch + effect deps:

```tsx
    fetch(`/api/cv?lang=${lang}`)
```

with:

```tsx
    fetch(`${apiBasePath}/cv?lang=${lang}`)
```

and:

```tsx
  }, [lang]);
```

with:

```tsx
  }, [lang, apiBasePath]);
```

- [ ] **Step 3: Update `CvPanelView` fetch + print URLs**

In `components/cv/cv-panel-view.tsx`, read the new context fields. Replace:

```tsx
  const { lang, strings, closeFile } = useKb();
```

with:

```tsx
  const { lang, strings, closeFile, apiBasePath, cvPrintBase } = useKb();
```

Replace both copy/download fetches (two occurrences):

```tsx
    const res = await fetch(`/api/cv?lang=${lang}`);
```

with:

```tsx
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
```

Replace the print launcher:

```tsx
    window.open(`/cv?lang=${lang}&print=1`, "_blank", "noopener");
```

with:

```tsx
    window.open(`${cvPrintBase}/cv?lang=${lang}&print=1`, "_blank", "noopener");
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS. (Root account still works: `apiBasePath` defaults to `/api`, `cvPrintBase` to "".)

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-context.tsx components/cv/cv-document-client.tsx components/cv/cv-panel-view.tsx
git commit -m "feat(cv): make in-panel CV fetch/print account-aware via KbContext"
```

---

### Task 6: Ungate the in-panel CV for every account

Splits the `isRootAccount` gate so the CV affordance shows for all accounts while
MCP stays root-only, and wires each account's `cvPrintBase`.

**Files:**
- Modify: `components/home-shell.tsx` (ungate CV button; account-aware About link)
- Modify: `components/home-page-client.tsx` (`includeCv` always on; forward `cvPrintBase`)
- Modify: `app/[username]/page.tsx` (pass `cvPrintBase`)

- [ ] **Step 1: Ungate the CV button + account-aware About link in `home-shell.tsx`**

Read `cvPrintBase` from context. Replace:

```tsx
  const { openFile } = useKb();
```

with:

```tsx
  const { openFile, cvPrintBase } = useKb();
```

Ungate the CV button. Replace:

```tsx
          cvButtonLabel={isRootAccount ? t.kb.openCv : undefined}
          onOpenCv={isRootAccount ? openCv : undefined}
```

with:

```tsx
          cvButtonLabel={t.kb.openCv}
          onOpenCv={openCv}
```

Make the About-popover CV link account-aware. Replace:

```tsx
        cvHref={`/cv?lang=${lang}`}
```

with:

```tsx
        cvHref={`${cvPrintBase}/cv?lang=${lang}`}
```

(Leave the `mcpButtonLabel`, `onOpenMcp`, and `{isRootAccount && <McpModal …/>}` lines unchanged — MCP stays root-only.)

- [ ] **Step 2: Turn on `includeCv` for all accounts + forward `cvPrintBase` in `home-page-client.tsx`**

Add the prop. Replace:

```tsx
  /** Base path for API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** When false, CV affordance and MCP button/modal are hidden. Defaults to true. */
  isRootAccount?: boolean;
};

export function HomePageClient({
  strings,
  contentRepoUrl,
  apiBasePath = "/api",
  isRootAccount = true,
}: Props) {
```

with:

```tsx
  /** Base path for API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** Account page base for CV links: "" (→ /cv) or "/{username}". */
  cvPrintBase?: string;
  /** When false, MCP button/modal are hidden. Defaults to true. */
  isRootAccount?: boolean;
};

export function HomePageClient({
  strings,
  contentRepoUrl,
  apiBasePath = "/api",
  cvPrintBase = "",
  isRootAccount = true,
}: Props) {
```

Replace the provider line (the CV is now available to every account; only MCP is gated):

```tsx
    <KbProvider lang={lang} kbStrings={t.kb} apiBasePath={apiBasePath} includeCv={isRootAccount}>
```

with:

```tsx
    <KbProvider lang={lang} kbStrings={t.kb} apiBasePath={apiBasePath} cvPrintBase={cvPrintBase}>
```

- [ ] **Step 3: Pass `cvPrintBase` from the per-account page**

In `app/[username]/page.tsx`, replace:

```tsx
    <HomePageClient
      strings={strings}
      contentRepoUrl={sourceRow?.repoUrl ?? null}
      apiBasePath={`/api/a/${account.username}`}
      isRootAccount={false}
    />
```

with:

```tsx
    <HomePageClient
      strings={strings}
      contentRepoUrl={sourceRow?.repoUrl ?? null}
      apiBasePath={`/api/a/${account.username}`}
      cvPrintBase={`/${account.username}`}
      isRootAccount={false}
    />
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/home-shell.tsx components/home-page-client.tsx "app/[username]/page.tsx"
git commit -m "feat(cv): show in-panel CV for every account (MCP stays root-only)"
```

---

### Task 7: Custom-domain `/cv` rewrite

**Files:**
- Modify: `lib/domains/host.ts` (add pure `customHostTarget`)
- Modify: `tests/lib/domains/host.test.ts` (cover it)
- Modify: `middleware.ts` (rewrite `/` and `/cv` for custom hosts)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/domains/host.test.ts`. First extend the import:

```ts
import { isPlatformHost, resolveCustomHost, customHostTarget } from "@/lib/domains/host";
```

Then add:

```ts
describe("customHostTarget", () => {
  it("maps the vanity-hosted home and CV paths to the tenant", () => {
    expect(customHostTarget("/", "alex")).toBe("/alex");
    expect(customHostTarget("/cv", "alex")).toBe("/alex/cv");
  });
  it("returns null for any non-vanity path (passes through)", () => {
    expect(customHostTarget("/about", "alex")).toBeNull();
    expect(customHostTarget("/alex/cv", "alex")).toBeNull();
    expect(customHostTarget("/cv/extra", "alex")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/domains/host.test.ts`
Expected: FAIL — `customHostTarget` is not exported.

- [ ] **Step 3: Add `customHostTarget`**

In `lib/domains/host.ts`, append:

```ts
/** Paths the platform vanity-hosts on a tenant's custom domain. */
const VANITY_PATHS = new Set(["/", "/cv"]);

/**
 * Map an incoming path on a custom (tenant) host to the internal tenant path to
 * rewrite to, or null to pass the request through unchanged. Only the account
 * home ("/") and its CV ("/cv") are vanity-hosted; everything else resolves by
 * its normal path.
 */
export function customHostTarget(pathname: string, slug: string): string | null {
  if (!VANITY_PATHS.has(pathname)) return null;
  return pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/domains/host.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in middleware**

In `middleware.ts`, extend the import:

```ts
import { isPlatformHost, resolveCustomHost, customHostTarget } from "@/lib/domains/host";
```

Replace the existing custom-domain block:

```ts
  // Custom-domain vanity hosting: a non-platform host hitting the root renders
  // that account's page in place. Only "/" is rewritten — the namespaced
  // /api/a/{slug}/* calls are excluded from middleware and resolve by path.
  if (request.nextUrl.pathname === "/" && !isPlatformHost(host, platformHost)) {
    const slug = await resolveCustomHost(host, getDomainSlug);
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/${slug}`;
      const rewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      rewrite.headers.set("content-security-policy", csp);
      return rewrite;
    }
  }
```

with:

```ts
  // Custom-domain vanity hosting: a non-platform host serves that account's home
  // ("/") and CV ("/cv") in place. The namespaced /api/a/{slug}/* calls are
  // excluded from middleware and resolve by path. The first `customHostTarget`
  // call is a cheap membership check that avoids a KV lookup on non-vanity paths.
  if (!isPlatformHost(host, platformHost) && customHostTarget(request.nextUrl.pathname, "") !== null) {
    const slug = await resolveCustomHost(host, getDomainSlug);
    const dest = slug ? customHostTarget(request.nextUrl.pathname, slug) : null;
    if (dest) {
      const url = request.nextUrl.clone();
      url.pathname = dest;
      const rewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      rewrite.headers.set("content-security-policy", csp);
      return rewrite;
    }
  }
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `npm run typecheck && npx vitest run tests/lib/domains/host.test.ts`
Expected: typecheck clean; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/domains/host.ts tests/lib/domains/host.test.ts middleware.ts
git commit -m "feat(cv): vanity-host /cv on custom domains"
```

---

### Task 8 (OPTIONAL): Per-account CVs in the sitemap

Adds per-account `/{username}` + `/{username}/cv` entries for configured accounts.
Skip if you'd rather keep the sitemap static — the existing `/cv` entry still works.

**Files:**
- Modify: `app/sitemap.ts`
- Test: `tests/app/sitemap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/sitemap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const listAllAccounts = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/accounts/repo", () => ({ listAllAccounts }));

beforeEach(() => vi.clearAllMocks());

describe("sitemap", () => {
  it("includes per-account CV URLs for repo-linked accounts only", async () => {
    listAllAccounts.mockResolvedValue([
      { username: "alex", repoLinked: true },
      { username: "ghost", repoLinked: false },
    ]);
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/alex/cv"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/alex"))).toBe(true);
    expect(urls.some((u) => u.includes("/ghost"))).toBe(false);
  });

  it("falls back to static entries when the DB is unavailable", async () => {
    listAllAccounts.mockRejectedValue(new Error("db down"));
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/cv"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/about"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/sitemap.test.ts`
Expected: FAIL — current `sitemap` is sync and has no per-account URLs.

- [ ] **Step 3: Make the sitemap async + enumerate accounts**

Replace the entire contents of `app/sitemap.ts` with:

```ts
import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db/client";
import { listAllAccounts } from "@/lib/accounts/repo";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/about`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/cv`, changeFrequency: "weekly", priority: 0.9 },
  ];
  try {
    const accounts = await listAllAccounts(getDb());
    const perAccount: MetadataRoute.Sitemap = accounts
      .filter((a) => a.repoLinked)
      .flatMap((a) => [
        { url: `${SITE}/${a.username}`, changeFrequency: "weekly", priority: 0.7 },
        { url: `${SITE}/${a.username}/cv`, changeFrequency: "weekly", priority: 0.6 },
      ]);
    return [...base, ...perAccount];
  } catch {
    // DB unavailable at build/runtime → static entries only.
    return base;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/app/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/sitemap.ts tests/app/sitemap.test.ts
git commit -m "feat(cv): list per-account CVs in the sitemap"
```

---

### Task 9: Full verification

- [ ] **Step 1: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests PASS; build succeeds (confirms the new routes compile and prerender).

- [ ] **Step 2: Manual smoke test (dev server)**

Start the app (`/run` skill or `npm run dev`) and verify, signed in / configured:
- `/{username}` shows a **CV** button in the top bar; clicking opens the in-panel CV scoped to that account.
- In-panel **Copy** / **Download** produce that account's CV markdown; **Print** opens `/{username}/cv?print=1` and auto-prints.
- `/{username}/cv` renders the account's printable CV; the language toggle navigates within `/{username}/cv`; the back link goes to `/{username}`.
- An unknown slug at `/{nope}/cv` 404s.
- `/cv` and `/api/cv` still serve the featured/root account (unchanged).
- On a non-root account, the **MCP** button/modal are absent (still root-only).
- CV repo lists show **public repos only** (privacy filter intact).

Custom-domain `/cv` rewrite can't be exercised locally; it's covered by the `customHostTarget` unit test and the middleware wiring. Verify on a preview/prod deploy with a real custom domain.

- [ ] **Step 3: Finalize**

Use the `superpowers:finishing-a-development-branch` skill to merge / open a PR.

---

## Self-Review

**Spec coverage:**
- Shared loader `lib/cv/load.ts` → Task 1. ✓
- Keep `/api/cv` (root) + new `/api/a/[username]/cv` → Task 2. ✓
- Keep `/cv` + new `/[username]/cv` via shared `CvStandalone` → Tasks 3–4. ✓
- In-panel CV for every account; MCP stays root-only → Tasks 5–6. ✓
- Account-aware fetch (`apiBasePath`) + print/back/About links (`cvPrintBase`) → Tasks 5–6. ✓
- Custom-domain `/cv` rewrite → Task 7. ✓
- Sitemap (optional) → Task 8. ✓
- Privacy via single chokepoint → Task 1 (`loadCvKb` → `filterKbForCv`), test in Task 1. ✓

**Placeholder scan:** none — every code step has complete code; every move/command is exact.

**Type consistency:** `loadCvKb(accountId, lang) → { root, cvKb } | null` and `cvPersonaName(accountId) → string | null` (Task 1) are used with those exact shapes in Tasks 2 & 4. `CvStandalone({ cvKb, lang, basePath })` (Task 3) is called with those props in Task 4. `cvPrintBase` is added to `KbContextValue`/`KbProvider` (Task 5) before it is read in `home-shell.tsx` and passed in `home-page-client.tsx`/`app/[username]/page.tsx` (Task 6). `CvTopBar` gains `basePath?` (Task 3) used by `CvStandalone` (Task 3). `customHostTarget(pathname, slug)` (Task 7) is used consistently in its test and middleware.

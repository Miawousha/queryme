# Agent-First KB Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users see a guided empty state on the admin Content tab with a copy-paste prompt that lets Claude Code (or any coding agent) build their content repo by fetching an agent-oriented setup guide served at `/setup-guide.md`.

**Architecture:** A new public route concatenates a new agent preamble with the existing `docs/content-repo-guide.md` (single source of truth — no schema duplication). A new `KbSetupSteps` client component renders the three-step onboarding plus the prompt; `ContentTab` shows it in place of the current one-line empty state and gains a `username` prop supplied by the settings page.

**Tech Stack:** Next.js 15 App Router (route handler + `outputFileTracingIncludes`), React 19 client components, Tailwind classes matching existing admin styling, Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-12-agent-first-kb-onboarding-design.md`

---

### Task 1: Agent setup preamble document

**Files:**
- Create: `docs/agent-setup-preamble.md`

This is prose, not code — no test. The route test in Task 2 asserts its heading is served. The exact content below is the deliverable; write it verbatim.

- [ ] **Step 1: Write `docs/agent-setup-preamble.md`**

````markdown
# Queritae KB setup — agent instructions

You are a coding agent setting up a **Queritae content repo** for your user.
Queritae serves a queryable CV: visitors chat with an agent whose only
knowledge is the content repo you are about to build. The repo holds the
user's knowledge base (KB), system prompt, and persona config — plain YAML
and Markdown files in a **public** GitHub repo.

Everything after this preamble is the complete schema reference for that
repo. Follow this workflow:

## Workflow

1. **Gather source material.** Ask the user for whatever they have: a
   CV/resume (PDF or text), a LinkedIn export, a personal site or portfolio
   URL, project READMEs. Read all of it before writing anything.
2. **Scaffold the repo.** Create a new local git repo with the layout from
   "Repo layout" in the reference. Start with the required files only:
   `persona.yaml`, `prompts/system.md`, `kb/profile.yaml`, `kb/skills.yaml`,
   `kb/education.yaml`, `kb/public-contact.yaml` (add `.fr` variants only if
   the user wants French).
3. **Fill the KB.** Convert the source material into the schemas in the
   reference. Then interview the user — a few targeted questions at a
   time — to fill gaps and capture what a CV can't: stories, highlights,
   and context for `kb/experience/*.md` and `kb/projects/*.md`. Write in
   the user's voice; don't pad and don't invent anything.
4. **Self-check before pushing.** Re-read every file you wrote against the
   schema reference (field names, date formats, slug conventions, required
   front-matter). The sync validates with these exact schemas and rejects
   the repo on the first error.
5. **Publish.** Create a **public** GitHub repo (private repos cannot be
   synced — the fetch is unauthenticated), push, and give the user the
   repo URL.
6. **Hand off.** Tell the user to paste the repo URL in their Queritae
   admin — **Settings → Content**, then **Sync** (see "Connect it to
   Queritae" in the reference). If the sync reports an error, have the
   user paste it back to you; fix the file, push, and ask them to sync
   again.

---
````

- [ ] **Step 2: Commit**

```bash
git add docs/agent-setup-preamble.md
git commit -m "docs: agent setup preamble for /setup-guide.md"
```

---

### Task 2: `GET /setup-guide.md` route

**Files:**
- Create: `app/setup-guide.md/route.ts`
- Modify: `next.config.ts` (add `outputFileTracingIncludes`)
- Test: `tests/app/setup-guide.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/setup-guide.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/setup-guide.md/route";

describe("GET /setup-guide.md", () => {
  it("serves the agent preamble followed by the content-repo guide as markdown", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const body = await res.text();
    // Preamble first, schema reference second.
    const preambleAt = body.indexOf("# Queritae KB setup — agent instructions");
    const guideAt = body.indexOf("# Building Your Content Repo (Knowledge Base)");
    expect(preambleAt).toBeGreaterThanOrEqual(0);
    expect(guideAt).toBeGreaterThan(preambleAt);
    // Spot-check that real schema content is present.
    expect(body).toContain("kb/profile.yaml");
    expect(body).toContain("prompts/system.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/setup-guide.test.ts`
Expected: FAIL — cannot resolve `@/app/setup-guide.md/route` (module does not exist).

- [ ] **Step 3: Write the route handler**

Create `app/setup-guide.md/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// Served as one document: agent preamble first, then the full content-repo
// guide verbatim — the same file that documents the schemas the sync
// validates with, so what agents fetch cannot drift from validation.
const DOC_FILES = ["agent-setup-preamble.md", "content-repo-guide.md"];

export async function GET() {
  const parts = await Promise.all(
    DOC_FILES.map((name) =>
      readFile(path.join(process.cwd(), "docs", name), "utf8"),
    ),
  );
  return new Response(parts.join("\n\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 4: Include the docs in the serverless bundle**

In `next.config.ts`, the route reads from `docs/` at request time, so those files must be traced into the deployed function. Modify the config object:

```ts
const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/setup-guide.md": [
      "./docs/agent-setup-preamble.md",
      "./docs/content-repo-guide.md",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/app/setup-guide.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add app/setup-guide.md/route.ts next.config.ts tests/app/setup-guide.test.ts
git commit -m "feat(onboarding): serve agent setup guide at /setup-guide.md"
```

---

### Task 3: `KbSetupSteps` component

**Files:**
- Create: `components/admin/kb-setup-steps.tsx`
- Test: `tests/components/admin/kb-setup-steps.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/admin/kb-setup-steps.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";

describe("KbSetupSteps", () => {
  it("renders the prompt with the username and origin-correct URLs", () => {
    render(<KbSetupSteps username="alex" />);
    const origin = window.location.origin;
    const prompt = screen.getByTestId("setup-prompt");
    expect(prompt.textContent).toContain(`${origin}/alex`);
    expect(prompt.textContent).toContain(`${origin}/setup-guide.md`);
    expect(prompt.textContent).toContain("Queritae knowledge base");
  });

  it("renders the three steps and the manual-path link", () => {
    render(<KbSetupSteps username="alex" />);
    expect(screen.getByText(/copy this prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/builds your content repo/i)).toBeInTheDocument();
    expect(screen.getByText(/paste the repo url below/i)).toBeInTheDocument();
    const guideLink = screen.getByRole("link", { name: /read the setup guide/i });
    expect(guideLink).toHaveAttribute("href", "/setup-guide.md");
  });

  it("copies the full prompt to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KbSetupSteps username="alex" />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(
      `${window.location.origin}/setup-guide.md`,
    );
    // Button gives feedback after copying.
    await screen.findByRole("button", { name: /copied/i });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/kb-setup-steps.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/kb-setup-steps`.

- [ ] **Step 3: Write the component**

Create `components/admin/kb-setup-steps.tsx`:

```tsx
"use client";

import { useState } from "react";

function buildPrompt(username: string, origin: string): string {
  return [
    `I'm setting up my Queritae knowledge base — a queryable CV that will live at ${origin}/${username}.`,
    "",
    `Fetch ${origin}/setup-guide.md and follow it exactly. Ask me for my source material (CV, LinkedIn export, portfolio links), and interview me briefly to fill gaps and capture stories. When everything passes the guide's self-checks, create a public GitHub repo, push, and give me the repo URL to paste back here.`,
  ].join("\n");
}

// Empty-state onboarding for the Content tab: the quickest path to a KB is
// letting a coding agent build the content repo. Rendered only client-side
// (ContentTab shows it after its initial fetch), so window is available.
export function KbSetupSteps({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const prompt = buildPrompt(username, window.location.origin);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
        Set up your knowledge base
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        The quickest way to build your KB is to let a coding agent do it —
        Claude Code, or any assistant that can fetch a URL and push to GitHub.
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          <span className="font-medium">Copy this prompt</span> into your
          coding agent.
          <div className="mt-2 rounded border border-[var(--color-border)] p-2">
            <pre
              data-testid="setup-prompt"
              className="whitespace-pre-wrap font-sans text-xs text-[var(--color-text-secondary)]"
            >
              {prompt}
            </pre>
            <button
              type="button"
              onClick={copy}
              className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
        </li>
        <li>
          <span className="font-medium">The agent builds your content repo</span>{" "}
          from your CV plus a short interview, and pushes it to GitHub (public).
        </li>
        <li>
          <span className="font-medium">Paste the repo URL below and Sync.</span>{" "}
          If the sync fails, paste the error back into your agent.
        </li>
      </ol>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Prefer to write it by hand?{" "}
        <a
          href="/setup-guide.md"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Read the setup guide
        </a>
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/kb-setup-steps.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/kb-setup-steps.tsx tests/components/admin/kb-setup-steps.test.tsx
git commit -m "feat(onboarding): KbSetupSteps guided empty state component"
```

---

### Task 4: Wire `KbSetupSteps` into the Content tab

**Files:**
- Modify: `components/admin/content-tab.tsx` (empty-state branch, ~lines 8, 67–113)
- Modify: `app/[username]/admin/settings/content/page.tsx:14` (pass `username`)
- Test: `tests/components/admin/content-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/admin/content-tab.test.tsx`. (Follows the fetch-stub pattern of `tests/components/admin/domains-panel.test.tsx` — `ContentTab` fetches `${apiBasePath}/persona-source` on mount.)

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ContentTab } from "@/components/admin/content-tab";

function stubPersonaSource(active: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ active, history: [] }), { status: 200 }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ContentTab empty state", () => {
  it("shows the agent setup steps when no source is configured", async () => {
    stubPersonaSource(null);
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    await waitFor(() =>
      expect(screen.getByText(/set up your knowledge base/i)).toBeInTheDocument(),
    );
    // Prompt is personalized and the sync form is still present as step 3.
    expect(screen.getByTestId("setup-prompt").textContent).toContain("/alex");
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeInTheDocument();
    expect(screen.queryByText(/active source/i)).not.toBeInTheDocument();
  });

  it("shows the active source instead of the setup steps once configured", async () => {
    stubPersonaSource({
      id: "ps1",
      repoUrl: "https://github.com/alex/queritae-content",
      branch: "main",
      commitSha: "abc1234def",
      syncedAt: "2026-06-12T00:00:00.000Z",
      status: "ok",
      error: null,
    });
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    await waitFor(() =>
      expect(screen.getByText(/active source/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("alex/queritae-content")).toBeInTheDocument();
    expect(screen.queryByText(/set up your knowledge base/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/content-tab.test.tsx`
Expected: FAIL — TS prop error / `set up your knowledge base` not found (ContentTab has no `username` prop and renders the old one-liner).

- [ ] **Step 3: Modify `ContentTab`**

In `components/admin/content-tab.tsx`:

Add the import below the existing imports:

```tsx
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";
```

Change the signature:

```tsx
export function ContentTab({
  apiBasePath,
  username,
}: {
  apiBasePath: string;
  username: string;
}) {
```

Replace the first `<section>` (the "Active source" block, currently lines 69–113). The heading moves inside the active branch so the empty state is owned entirely by `KbSetupSteps`:

```tsx
      <section>
        {state.active ? (
          <>
            <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
              Active source
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <div>
                <span className="text-[var(--color-text-tertiary)]">repo: </span>
                <a
                  href={state.active.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {prettyRepo(state.active.repoUrl)}
                </a>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">branch: </span>
                {state.active.branch}
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">commit: </span>
                <code className="text-xs">{state.active.commitSha.slice(0, 7)}</code>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">last synced: </span>
                {new Date(state.active.syncedAt).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={resync}
                disabled={submitting}
                className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                {submitting ? "Syncing…" : "Resync from current source"}
              </button>
            </div>
          </>
        ) : (
          <KbSetupSteps username={username} />
        )}
        {lastError && <p className="mt-2 text-sm text-red-500">{lastError}</p>}
      </section>
```

(The "Update source" form section and "Sync history" section stay exactly as they are — the form is step 3's action.)

- [ ] **Step 4: Pass `username` from the page**

In `app/[username]/admin/settings/content/page.tsx`, change the return:

```tsx
  return (
    <ContentTab
      apiBasePath={`/api/a/${account.username}/admin`}
      username={account.username}
    />
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/content-tab.test.tsx tests/components/admin/kb-setup-steps.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add components/admin/content-tab.tsx app/\[username\]/admin/settings/content/page.tsx tests/components/admin/content-tab.test.tsx
git commit -m "feat(onboarding): guided agent-first empty state on Content tab"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the three new test files.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0. (Catches any other `<ContentTab>` call sites missing the new required `username` prop.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build succeeds; route list includes `/setup-guide.md`.

- [ ] **Step 4: Smoke-test the route and the empty state**

Run: `pnpm dev` (background), then:

```bash
curl -s http://localhost:3000/setup-guide.md | head -5
```

Expected: starts with `# Queritae KB setup — agent instructions`.

In the browser preview, open `/{username}/admin/settings/content` for an account with no persona source: the three-step empty state renders, the prompt shows the right username and origin, "Copy prompt" works. For a configured account the active-source view renders unchanged.

- [ ] **Step 5: Dogfood smoke test (manual, post-merge ok)**

Run the copied prompt in a fresh Claude Code session against a test account end-to-end: agent fetches the guide, builds and pushes a repo, sync succeeds, first question answered. This validates the preamble's instructions — file an issue/tweak the preamble if the agent stumbles.

# User Admin Revamp (IA Restructure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the per-account admin at `/[username]/admin` from a flat 6-tab monolith into a grouped left-rail nav with deep-linkable nested routes, merging Interviewers into a Conversations filter while keeping Questions as its own action queue.

**Architecture:** Dissolve the 664-line `components/admin/admin-dashboard.tsx` into focused modules (shared UI primitives, row/detail renderers, section components, a nav rail, a header), then cut the page over to Next.js App Router nested routes under `app/[username]/admin/` with a shared `layout.tsx` that runs the auth gate and renders the rail. Active section lives in the route; the selected record lives in a URL search param (`?c=` conversation, `?q=` question). API routes are untouched.

**Tech Stack:** Next.js 15 (App Router, React 19 server + `"use client"` components), TypeScript, Drizzle ORM (Neon HTTP), Tailwind v4 with CSS-var design tokens, Vitest + `@testing-library/react` + `@testing-library/user-event` (jsdom), `fetch` stubbed via `vi.stubGlobal`.

**Design doc:** `docs/superpowers/specs/2026-06-03-user-admin-revamp-design.md`

**Conventions:**
- Run a single test file: `pnpm vitest run tests/path/to/file.test.ts`
- Run all tests: `pnpm test` · Typecheck: `pnpm typecheck`
- The `@/*` alias maps to the repo root (see `vitest.config.ts`).
- DB-integration tests are gated behind `RUN_DB_TESTS` (see `tests/lib/admin/data.test.ts`); plain unit/component tests run without a DB.
- Commit after every task once its tests + `pnpm typecheck` pass.

---

## File Structure

**New files**
- `lib/admin/format.ts` — `fmt()` timestamp formatter (moved out of the monolith).
- `components/admin/ui.tsx` — shared `LABEL`, `Badge`, `Field` (deduped from the monolith + `domains-panel.tsx`).
- `lib/admin/require-admin.ts` — `requireAdminAccount(username)`: the gate as a helper (throws `notFound`/`redirect`, returns `Account`).
- `components/admin/rows/conversation-row.tsx` — unified conversation row (handles interviewer-identified + plain).
- `components/admin/rows/question-row.tsx` — forwarded-question row.
- `components/admin/details/conversation-detail.tsx` — unified detail: optional interviewer-identity block + transcript.
- `components/admin/details/question-detail.tsx` — question + reply form (callback for cross-link).
- `components/admin/sections/analytics-section.tsx` — relocated `AnalyticsPanel`.
- `components/admin/sections/conversations-section.tsx` — list + `All · Interviewers` segment + URL selection.
- `components/admin/sections/questions-section.tsx` — reply queue + URL selection + cross-link.
- `components/admin/admin-rail.tsx` — grouped left nav, counts, active state.
- `components/admin/admin-header.tsx` — top header (logo, account, theme, logout).
- `app/[username]/admin/layout.tsx` — gate + counts + header + rail shell.
- `app/[username]/admin/questions/page.tsx`, `analytics/page.tsx`, `settings/content/page.tsx`, `settings/domains/page.tsx`, `settings/page.tsx`.

**Modified files**
- `lib/admin/data.ts` — add `loadConversations`, `loadQuestions`, `loadAdminCounts`; refactor `loadAdminData` to reuse them.
- `components/admin/domains-panel.tsx` — import `LABEL` from `ui.tsx` (drop local copy).
- `app/[username]/admin/page.tsx` — becomes the Conversations route (renders `ConversationsSection`).

**Deleted files**
- `components/admin/admin-dashboard.tsx` — dissolved (final task).

**Reused unchanged:** `components/admin/record-list.tsx`, `detail-sidebar.tsx`, `content-tab.tsx`, `domains-panel.tsx` (minus the `LABEL` dedupe), `logout-button.tsx`; all `app/api/a/[username]/admin/**` routes; `app/[username]/admin/resolve.ts`.

---

## Task 1: Shared UI primitives (`fmt`, `LABEL`, `Badge`, `Field`)

**Files:**
- Create: `lib/admin/format.ts`, `components/admin/ui.tsx`
- Test: `tests/lib/admin/format.test.ts`
- Modify: `components/admin/domains-panel.tsx:6` (drop local `LABEL`, import from `ui.tsx`)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fmt } from "@/lib/admin/format";

describe("fmt", () => {
  it("renders an em dash for null / empty input", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt("")).toBe("—");
  });
  it("renders an em dash for an unparseable date string", () => {
    expect(fmt("not-a-date")).toBe("—");
  });
  it("renders a non-dash string for a valid date", () => {
    expect(fmt(new Date("2026-05-22T10:30:00Z"))).not.toBe("—");
    expect(fmt("2026-05-22T10:30:00Z")).not.toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/format.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/format`.

- [ ] **Step 3: Create `lib/admin/format.ts`**

```ts
/** Format a timestamp for the admin UI; "—" for missing or unparseable input. */
export function fmt(value: Date | string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

- [ ] **Step 4: Create `components/admin/ui.tsx`**

```tsx
import type { ReactNode } from "react";

/** Small uppercase mono caption used across the admin UI. */
export const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
      style={{ letterSpacing: "0.16em" }}
    >
      {children}
    </span>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
```

- [ ] **Step 5: Dedupe `LABEL` in `domains-panel.tsx`**

In `components/admin/domains-panel.tsx`, delete the local line:

```tsx
const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
```

and add to its imports (top of file, after the `cn` import):

```tsx
import { LABEL } from "@/components/admin/ui";
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm vitest run tests/lib/admin/format.test.ts tests/components/admin/domains-panel.test.tsx && pnpm typecheck`
Expected: PASS (domains-panel test still green; no type errors).

- [ ] **Step 7: Commit**

```bash
git add lib/admin/format.ts components/admin/ui.tsx components/admin/domains-panel.tsx tests/lib/admin/format.test.ts
git commit -m "refactor(admin): extract shared fmt + UI primitives"
```

---

## Task 2: Data loaders + rail counts

**Files:**
- Modify: `lib/admin/data.ts`
- Test: `tests/lib/admin/data.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/admin/data.test.ts` (inside the existing `RUN_DB`-gated block area — add a new gated block at the end of the file):

```ts
d("loadAdminCounts (account filter, integration)", () => {
  it("counts conversations and unanswered questions for the account", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { accounts, conversations, forwardedQuestions } = await import("@/lib/db/schema");
    const { createAccount } = await import("@/lib/accounts/repo");
    const { getOrCreateConversation } = await import("@/lib/conversations/repo");
    const { loadAdminCounts } = await import("@/lib/admin/data");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    const a = await createAccount(db, { username: `counts-a-${Date.now()}` });
    const cid = randomUUID();
    await getOrCreateConversation(db, { id: cid, channel: "chat", accountId: a.id });
    const qid = randomUUID();
    await db.insert(forwardedQuestions).values({ id: qid, conversationId: cid, question: "Q?" });
    try {
      const counts = await loadAdminCounts(db, a.id);
      expect(counts.conversations).toBe(1);
      expect(counts.unanswered).toBe(1);
    } finally {
      await db.delete(forwardedQuestions).where(eq(forwardedQuestions.id, qid));
      await db.delete(conversations).where(eq(conversations.id, cid));
      await db.delete(accounts).where(eq(accounts.id, a.id));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 pnpm vitest run tests/lib/admin/data.test.ts` (requires `.env.local` with `POSTGRES_URL`).
Expected: FAIL — `loadAdminCounts` is not exported.
(If no DB is available, this block is `describe.skip`; verify instead via Step 4 typecheck — note this in the commit.)

- [ ] **Step 3: Add the loaders to `lib/admin/data.ts`**

Update the imports at the top of `lib/admin/data.ts`:

```ts
import { and, count, desc, eq, isNull } from "drizzle-orm";
```

Add the new loaders (after `buildAdminData`, before the existing `loadAdminData`):

```ts
/** Most-recent conversations for the account (capped at CONVERSATION_LIMIT). */
export async function loadConversations(db: Db, accountId: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(CONVERSATION_LIMIT);
}

/** Forwarded questions for the account, most recent first. */
export async function loadQuestions(db: Db, accountId: string): Promise<ForwardedQuestion[]> {
  const rows = await db
    .select({ q: forwardedQuestions })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(forwardedQuestions.createdAt));
  return rows.map((r) => r.q);
}

export type AdminCounts = { conversations: number; unanswered: number };

/** Cheap COUNT(*) queries for the nav-rail badges. */
export async function loadAdminCounts(db: Db, accountId: string): Promise<AdminCounts> {
  const [convRow] = await db
    .select({ n: count() })
    .from(conversations)
    .where(eq(conversations.accountId, accountId));
  const [unansweredRow] = await db
    .select({ n: count() })
    .from(forwardedQuestions)
    .innerJoin(conversations, eq(forwardedQuestions.conversationId, conversations.id))
    .where(and(eq(conversations.accountId, accountId), isNull(forwardedQuestions.answeredAt)));
  return { conversations: Number(convRow.n), unanswered: Number(unansweredRow.n) };
}
```

- [ ] **Step 4: Refactor `loadAdminData` to reuse the loaders**

Replace the existing `loadAdminData` body with:

```ts
export async function loadAdminData(db: Db, accountId: string): Promise<AdminData> {
  const [convs, qRows] = await Promise.all([
    loadConversations(db, accountId),
    loadQuestions(db, accountId),
  ]);
  return buildAdminData(convs, qRows);
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/lib/admin/data.test.ts && pnpm typecheck`
Expected: PASS — the existing `buildAdminData` unit tests stay green; the new integration block is skipped without `RUN_DB_TESTS`.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/data.ts tests/lib/admin/data.test.ts
git commit -m "refactor(admin): split data loaders + add rail counts"
```

---

## Task 3: `requireAdminAccount` gate helper

**Files:**
- Create: `lib/admin/require-admin.ts`
- Test: `tests/lib/admin/require-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin/require-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccountAdmin = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/app/[username]/admin/resolve", () => ({ resolveAccountAdmin }));
vi.mock("next/navigation", () => ({ notFound, redirect }));

beforeEach(() => {
  resolveAccountAdmin.mockReset();
  notFound.mockClear();
  redirect.mockClear();
});

describe("requireAdminAccount", () => {
  it("returns the account when the gate resolves ok", async () => {
    const account = { id: "a", username: "alex", role: "user" };
    resolveAccountAdmin.mockResolvedValue({ kind: "ok", account });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    expect(await requireAdminAccount("alex")).toEqual(account);
  });
  it("calls notFound for an unknown / forbidden slug", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "not-found" });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    await expect(requireAdminAccount("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
  it("redirects to GitHub login when unauthenticated", async () => {
    resolveAccountAdmin.mockResolvedValue({ kind: "login" });
    const { requireAdminAccount } = await import("@/lib/admin/require-admin");
    await expect(requireAdminAccount("alex")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/api/auth/github/login");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/require-admin.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/require-admin`.

- [ ] **Step 3: Create `lib/admin/require-admin.ts`**

```ts
import { notFound, redirect } from "next/navigation";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import type { Account } from "@/lib/db/schema";

/**
 * Server-side gate for the per-account admin section. Mirrors the resolution
 * used by `app/[username]/admin/page.tsx` today, as a reusable helper so the
 * shared layout and each route segment gate identically. Throws (via Next's
 * `notFound`/`redirect`) on failure; returns the resolved account on success.
 */
export async function requireAdminAccount(username: string): Promise<Account> {
  const res = await resolveAccountAdmin(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");
  return res.account;
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/lib/admin/require-admin.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/require-admin.ts tests/lib/admin/require-admin.test.ts
git commit -m "feat(admin): add requireAdminAccount gate helper"
```

---

## Task 4: Row renderers (conversation, question)

**Files:**
- Create: `components/admin/rows/conversation-row.tsx`, `components/admin/rows/question-row.tsx`
- Test: `tests/components/admin/rows/conversation-row.test.tsx`, `tests/components/admin/rows/question-row.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/admin/rows/conversation-row.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationRow } from "@/components/admin/rows/conversation-row";
import type { Conversation } from "@/lib/db/schema";

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    ...overrides,
  };
}

describe("ConversationRow", () => {
  it("shows the interviewer name and subtitle when identified", () => {
    render(
      <ConversationRow
        conversation={conv({
          interviewer: {
            name: "Sarah Lee",
            role: "VP Eng",
            company: "Acme",
            basis: "stated",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.getByText(/VP Eng · Acme/)).toBeInTheDocument();
    expect(screen.getByText("stated")).toBeInTheDocument();
  });

  it("shows channel + turn count for a plain conversation", () => {
    render(
      <ConversationRow
        conversation={conv({
          channel: "mcp",
          transcript: [{ role: "user", text: "hi", at: "2026-05-22T00:00:00.000Z" }],
        })}
      />,
    );
    expect(screen.getByText("mcp")).toBeInTheDocument();
    expect(screen.getByText("1 turns")).toBeInTheDocument();
  });
});
```

Create `tests/components/admin/rows/question-row.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionRow } from "@/components/admin/rows/question-row";
import type { ForwardedQuestion } from "@/lib/db/schema";

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your salary expectation?",
    contact: null,
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

describe("QuestionRow", () => {
  it("marks an unanswered question", () => {
    render(<QuestionRow question={q({})} />);
    expect(screen.getByText("What is your salary expectation?")).toBeInTheDocument();
    expect(screen.getByText(/unanswered/i)).toBeInTheDocument();
  });
  it("marks an answered question", () => {
    render(<QuestionRow question={q({ answeredAt: new Date("2026-05-22T00:00:00Z") })} />);
    expect(screen.getByText(/^answered/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/rows`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `components/admin/rows/conversation-row.tsx`**

```tsx
import type { Conversation } from "@/lib/db/schema";
import { Badge } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

/**
 * Compact list-cell for a conversation. When the agent has identified the
 * visitor (`interviewer != null`) the row leads with the interviewer's name and
 * role/company; otherwise it shows channel + turn count. One component serves
 * both the "All" and "Interviewers" segments of the Conversations list.
 */
export function ConversationRow({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  const identity = conversation.interviewer;

  if (identity) {
    const subtitle = [identity.role, identity.company].filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm text-[var(--color-text-primary)]">
            {identity.name ?? "Unknown name"}
          </span>
          <Badge>{identity.basis}</Badge>
          <Badge>{conversation.channel}</Badge>
          <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {fmt(conversation.lastMessageAt)}
          </span>
        </div>
        {subtitle && (
          <span className="text-[12px] text-[var(--color-text-tertiary)]">{subtitle}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
      <Badge>{conversation.channel}</Badge>
      {conversation.language && <Badge>{conversation.language}</Badge>}
      <span className="ml-auto flex items-center gap-3 text-[var(--color-text-tertiary)]">
        <span>{turns.length} turns</span>
        <span>{fmt(conversation.lastMessageAt)}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/admin/rows/question-row.tsx`**

```tsx
import type { ForwardedQuestion } from "@/lib/db/schema";
import { fmt } from "@/lib/admin/format";

export function QuestionRow({ question }: { question: ForwardedQuestion }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-[var(--color-text-primary)]">{question.question}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span>{fmt(question.createdAt)}</span>
        {question.answeredAt ? (
          <span className="font-mono text-[9px] uppercase text-[var(--color-text-secondary)]">
            answered {fmt(question.answeredAt)}
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase text-[var(--color-accent)]">
            unanswered
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/components/admin/rows && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/rows tests/components/admin/rows
git commit -m "refactor(admin): extract conversation + question row renderers"
```

---

## Task 5: Unified conversation detail (identity + transcript)

**Files:**
- Create: `components/admin/details/conversation-detail.tsx`
- Test: `tests/components/admin/details/conversation-detail.test.tsx`

This **merges** the old `InterviewerDetail` and `ConversationDetail`: one detail shows the interviewer-identity block (when present) followed by the transcript. The old "Open conversation →" cross-link inside interviewer detail is removed (an interviewer *is* a conversation — same record, same panel).

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/details/conversation-detail.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationDetail } from "@/components/admin/details/conversation-detail";
import type { Conversation } from "@/lib/db/schema";

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    ...overrides,
  };
}

describe("ConversationDetail", () => {
  it("renders the transcript turns", () => {
    render(
      <ConversationDetail
        conversation={conv({
          transcript: [
            { role: "user", text: "Hello there", at: "2026-05-22T00:00:00.000Z" },
            { role: "assistant", text: "Hi! How can I help?", at: "2026-05-22T00:01:00.000Z" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("shows the interviewer identity block when identified", () => {
    render(
      <ConversationDetail
        conversation={conv({
          interviewer: {
            name: "Sarah Lee",
            company: "Acme",
            role: "VP Eng",
            notes: "Warm intro via a mutual contact.",
            basis: "stated",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("VP Eng")).toBeInTheDocument();
    expect(screen.getByText(/Warm intro/)).toBeInTheDocument();
  });

  it("omits the identity block for a plain conversation", () => {
    render(<ConversationDetail conversation={conv({})} />);
    expect(screen.queryByText("Interviewer")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/details/conversation-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/details/conversation-detail.tsx`**

```tsx
import type { Conversation } from "@/lib/db/schema";
import { Badge, Field, LABEL } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

/**
 * Unified detail body for a conversation. If the agent identified the visitor,
 * an interviewer-identity block is shown above the transcript — the same record
 * serves both the "Conversations" and "Interviewers" views, so there is no
 * cross-link to a separate conversation panel.
 */
export function ConversationDetail({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  const identity = conversation.interviewer;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{conversation.channel}</Badge>
        {conversation.language && <Badge>{conversation.language}</Badge>}
        {identity && <Badge>{identity.basis}</Badge>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {turns.length} turns
        </span>
      </div>

      {identity && (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-3">
          <span className={LABEL}>Interviewer</span>
          <div className="grid grid-cols-2 gap-3">
            {identity.company && <Field label="Company" value={identity.company} />}
            {identity.role && <Field label="Role" value={identity.role} />}
            {identity.hiringFor && <Field label="Hiring for" value={identity.hiringFor} />}
            {identity.contact && <Field label="Contact" value={identity.contact} />}
          </div>
          {identity.notes && (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Notes</span>
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {identity.notes}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
        id {conversation.id} · started {fmt(conversation.startedAt)} · last{" "}
        {fmt(conversation.lastMessageAt)}
      </p>

      {turns.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">Empty transcript.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className={LABEL}>
                {t.role} · {fmt(t.at)}
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-primary)]">
                {t.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/details/conversation-detail.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/details/conversation-detail.tsx tests/components/admin/details/conversation-detail.test.tsx
git commit -m "feat(admin): unified conversation detail (identity + transcript)"
```

---

## Task 6: Question detail (reply form + cross-link callback)

**Files:**
- Create: `components/admin/details/question-detail.tsx`
- Test: `tests/components/admin/details/question-detail.test.tsx`

The detail is router-free: it takes an `onOpenConversation(conversationId)` callback (the section wires it to navigation). Reply behavior matches today's monolith.

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/details/question-detail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionDetail } from "@/components/admin/details/question-detail";
import type { ForwardedQuestion } from "@/lib/db/schema";

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your notice period?",
    contact: "sarah@acme.com",
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("QuestionDetail", () => {
  it("posts a reply to the reply endpoint", async () => {
    render(<QuestionDetail question={q({})} apiBasePath="/api/a/alex/admin" onOpenConversation={() => {}} />);
    await userEvent.type(screen.getByRole("textbox"), "Two weeks.");
    await userEvent.click(screen.getByRole("button", { name: /send reply/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/a/alex/admin/questions/q1/reply",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("invokes onOpenConversation with the linked conversation id", async () => {
    const onOpen = vi.fn();
    render(<QuestionDetail question={q({})} apiBasePath="/api/a/alex/admin" onOpenConversation={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /open conversation/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/details/question-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/details/question-detail.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ForwardedQuestion } from "@/lib/db/schema";
import { Field } from "@/components/admin/ui";
import { LABEL } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

export function QuestionDetail({
  question,
  onOpenConversation,
  apiBasePath,
}: {
  question: ForwardedQuestion;
  onOpenConversation: (conversationId: string) => void;
  apiBasePath: string;
}) {
  const [draft, setDraft] = useState(question.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(
    question.answeredAt ? new Date(question.answeredAt) : null,
  );

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/questions/${question.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
      } else {
        setSavedAt(new Date());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {savedAt ? (
          <span
            className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.16em" }}
          >
            answered
          </span>
        ) : (
          <span
            className="rounded-full border border-[var(--color-accent)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-accent)]"
            style={{ letterSpacing: "0.16em" }}
          >
            unanswered
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {fmt(question.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-text-primary)]">
        {question.question}
      </p>
      {question.contact && <Field label="Visitor contact" value={question.contact} />}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Reply</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="rounded-md border border-[var(--color-border)] bg-transparent p-2 text-[13px]"
          placeholder="Write the reply you want to send…"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {question.contact ? "Will email the visitor on send." : "No contact — saved locally only."}
          </span>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={submit}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase",
              "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ letterSpacing: "0.18em" }}
          >
            {busy ? "Sending…" : savedAt ? "Update reply" : "Send reply"}
          </button>
        </div>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      {question.conversationId && (
        <button
          type="button"
          onClick={() => onOpenConversation(question.conversationId!)}
          className={cn(
            "self-start rounded-md border border-[var(--color-border)] px-3 py-1.5",
            "font-mono text-[10px] uppercase text-[var(--color-text-secondary)] transition-colors",
            "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-primary)]",
          )}
          style={{ letterSpacing: "0.18em" }}
        >
          Open conversation →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/details/question-detail.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/details/question-detail.tsx tests/components/admin/details/question-detail.test.tsx
git commit -m "refactor(admin): extract question detail with cross-link callback"
```

---

## Task 7: Analytics section (relocate `AnalyticsPanel`)

**Files:**
- Create: `components/admin/sections/analytics-section.tsx`
- Test: `tests/components/admin/sections/analytics-section.test.tsx`

Move the `AnalyticsPanel` + its `AnalyticsData` type out of the monolith verbatim, exported as `AnalyticsSection`, importing `LABEL` from `ui.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/sections/analytics-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AnalyticsSection } from "@/components/admin/sections/analytics-section";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          perDay: [{ date: "2026-05-22", count: 3 }],
          topics: [{ topic: "salary", count: 2 }],
          density: [{ conversationId: "abcdef12", assistantTurns: 4, avgCitations: 1.5 }],
        }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("AnalyticsSection", () => {
  it("fetches analytics and renders the sections", async () => {
    render(<AnalyticsSection apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/conversations per day/i)).toBeInTheDocument());
    expect(screen.getByText("salary")).toBeInTheDocument();
    expect(screen.getByText(/citation density/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/a/alex/admin/analytics");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/sections/analytics-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/sections/analytics-section.tsx`**

Copy the `AnalyticsData` type and `AnalyticsPanel` function from `components/admin/admin-dashboard.tsx` (lines ~279–381) into the new file, renaming the export to `AnalyticsSection` and importing the shared `LABEL`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { LABEL } from "@/components/admin/ui";

type AnalyticsData = {
  perDay: { date: string; count: number }[];
  topics: { topic: string; count: number }[];
  density: { conversationId: string; assistantTurns: number; avgCitations: number }[];
};

export function AnalyticsSection({ apiBasePath }: { apiBasePath: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${apiBasePath}/analytics`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [apiBasePath]);
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!data)
    return (
      <p className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">Loading…</p>
    );

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.count));
  const maxTopic = Math.max(1, ...data.topics.map((t) => t.count));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <span className={LABEL}>Conversations per day (last 30)</span>
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="h-16 w-full">
          {data.perDay.map((d, i) => {
            const x = (i / Math.max(1, data.perDay.length - 1)) * 300;
            const h = (d.count / maxDay) * 56;
            return (
              <rect key={d.date} x={x - 3} y={60 - h} width={6} height={h} fill="var(--color-accent)" opacity={0.85} />
            );
          })}
        </svg>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Top forwarded-question topics</span>
        <div className="flex flex-col gap-1">
          {data.topics.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)]">No data yet.</p>
          )}
          {data.topics.map((t) => (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="w-24 font-mono text-[10px] uppercase text-[var(--color-text-secondary)]">
                {t.topic}
              </span>
              <div className="h-2 flex-1 rounded bg-[var(--color-border)]">
                <div className="h-2 rounded bg-[var(--color-primary)]" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-[10px] text-[var(--color-text-tertiary)]">
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Citation density per conversation</span>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
              <th className="py-1.5 pr-3">Conversation</th>
              <th className="py-1.5 pr-3">Assistant turns</th>
              <th className="py-1.5">Avg citations</th>
            </tr>
          </thead>
          <tbody>
            {data.density.map((d) => (
              <tr key={d.conversationId} className="border-b border-[var(--color-border)]/40">
                <td className="py-1.5 pr-3 font-mono text-[10px] text-[var(--color-text-secondary)]">
                  {d.conversationId.slice(0, 8)}
                </td>
                <td className="py-1.5 pr-3">{d.assistantTurns}</td>
                <td className="py-1.5">{d.avgCitations.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/sections/analytics-section.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/sections/analytics-section.tsx tests/components/admin/sections/analytics-section.test.tsx
git commit -m "refactor(admin): relocate analytics panel to a section module"
```

---

## Task 8: Conversations section (segment filter + URL selection)

**Files:**
- Create: `components/admin/sections/conversations-section.tsx`
- Test: `tests/components/admin/sections/conversations-section.test.tsx`

**Establishes the `next/navigation` mock pattern** (reused by Tasks 9–10). The section reads the selected id from `?c=`, writes it via `router.push`, and offers an `All · Interviewers` segment filter (local state, with counts).

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/sections/conversations-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationsSection } from "@/components/admin/sections/conversations-section";
import type { Conversation } from "@/lib/db/schema";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/alex/admin",
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    ...overrides,
  };
}

const items: Conversation[] = [
  conv({ id: "c1", channel: "chat" }),
  conv({
    id: "c2",
    channel: "mcp",
    interviewer: { name: "Sarah Lee", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
  }),
];

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/alex/admin";
  nav.params = new URLSearchParams();
});

describe("ConversationsSection", () => {
  it("filters to interviewers when the segment is selected", async () => {
    render(<ConversationsSection conversations={items} />);
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /interviewers/i }));
    // The plain conversation row's channel badge is gone; the interviewer stays.
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.queryByText("chat")).not.toBeInTheDocument();
  });

  it("pushes ?c=<id> to the URL when a row is selected", async () => {
    render(<ConversationsSection conversations={items} />);
    await userEvent.click(screen.getByText("Sarah Lee"));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin?c=c2");
  });

  it("opens the detail for the conversation named by ?c=", () => {
    nav.params = new URLSearchParams("c=c2");
    render(<ConversationsSection conversations={items} />);
    // Detail sidebar shows the interviewer identity block.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/sections/conversations-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/sections/conversations-section.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Conversation } from "@/lib/db/schema";
import { RecordList } from "@/components/admin/record-list";
import { DetailSidebar } from "@/components/admin/detail-sidebar";
import { ConversationRow } from "@/components/admin/rows/conversation-row";
import { ConversationDetail } from "@/components/admin/details/conversation-detail";
import { cn } from "@/lib/utils";

type Segment = "all" | "interviewers";

export function ConversationsSection({ conversations }: { conversations: Conversation[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const [segment, setSegment] = useState<Segment>("all");

  const interviewers = useMemo(
    () => conversations.filter((c) => c.interviewer != null),
    [conversations],
  );
  const shown = segment === "interviewers" ? interviewers : conversations;
  const selected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null;

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("c", id);
    else next.delete("c");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <SegmentButton active={segment === "all"} onClick={() => setSegment("all")} label="All" count={conversations.length} />
        <SegmentButton
          active={segment === "interviewers"}
          onClick={() => setSegment("interviewers")}
          label="Interviewers"
          count={interviewers.length}
        />
      </div>
      <RecordList
        items={shown}
        getId={(c) => c.id}
        selectedId={selectedId}
        onSelect={select}
        rowIdPrefix="conv"
        ariaLabel="Conversations"
        empty={segment === "interviewers" ? "No interviewers identified yet." : "No conversations yet."}
        renderRow={(c) => <ConversationRow conversation={c} />}
      />
      <DetailSidebar
        open={selected !== null}
        onClose={() => select(null)}
        eyebrow={selected?.interviewer ? "Interviewer" : "Conversation"}
        title={selected ? detailTitle(selected) : ""}
      >
        {selected && <ConversationDetail conversation={selected} />}
      </DetailSidebar>
    </>
  );
}

function detailTitle(c: Conversation): string {
  if (c.interviewer) return c.interviewer.name ?? "Unknown name";
  return `${c.channel} · ${(c.transcript ?? []).length} turns`;
}

function SegmentButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase transition-colors",
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]",
      )}
      style={{ letterSpacing: "0.18em" }}
    >
      {label}
      <span className="text-[var(--color-text-tertiary)]">{count}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/sections/conversations-section.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/sections/conversations-section.tsx tests/components/admin/sections/conversations-section.test.tsx
git commit -m "feat(admin): conversations section with interviewers filter + URL selection"
```

---

## Task 9: Questions section (reply queue + cross-link)

**Files:**
- Create: `components/admin/sections/questions-section.tsx`
- Test: `tests/components/admin/sections/questions-section.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/sections/questions-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionsSection } from "@/components/admin/sections/questions-section";
import type { ForwardedQuestion } from "@/lib/db/schema";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/alex/admin/questions",
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your notice period?",
    contact: null,
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/alex/admin/questions";
  nav.params = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("QuestionsSection", () => {
  it("pushes ?q=<id> when a question is selected", async () => {
    render(<QuestionsSection questions={[q({})]} apiBasePath="/api/a/alex/admin" adminBasePath="/alex/admin" />);
    await userEvent.click(screen.getByText("What is your notice period?"));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin/questions?q=q1");
  });

  it("cross-links to the conversation on the admin index route", async () => {
    nav.params = new URLSearchParams("q=q1");
    render(<QuestionsSection questions={[q({})]} apiBasePath="/api/a/alex/admin" adminBasePath="/alex/admin" />);
    await userEvent.click(screen.getByRole("button", { name: /open conversation/i }));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin?c=c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/sections/questions-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/sections/questions-section.tsx`**

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ForwardedQuestion } from "@/lib/db/schema";
import { RecordList } from "@/components/admin/record-list";
import { DetailSidebar } from "@/components/admin/detail-sidebar";
import { QuestionRow } from "@/components/admin/rows/question-row";
import { QuestionDetail } from "@/components/admin/details/question-detail";

export function QuestionsSection({
  questions,
  apiBasePath,
  adminBasePath,
}: {
  questions: ForwardedQuestion[];
  apiBasePath: string;
  adminBasePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("q");
  const selected = selectedId ? questions.find((q) => q.id === selectedId) ?? null : null;

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("q", id);
    else next.delete("q");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function openConversation(conversationId: string) {
    router.push(`${adminBasePath}?c=${conversationId}`);
  }

  return (
    <>
      <RecordList
        items={questions}
        getId={(q) => q.id}
        selectedId={selectedId}
        onSelect={select}
        ariaLabel="Forwarded questions"
        empty="No forwarded questions."
        renderRow={(q) => <QuestionRow question={q} />}
      />
      <DetailSidebar open={selected !== null} onClose={() => select(null)} eyebrow="Question" title="Question">
        {selected && (
          <QuestionDetail
            key={selected.id}
            question={selected}
            apiBasePath={apiBasePath}
            onOpenConversation={openConversation}
          />
        )}
      </DetailSidebar>
    </>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/sections/questions-section.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/sections/questions-section.tsx tests/components/admin/sections/questions-section.test.tsx
git commit -m "feat(admin): questions section (reply queue + cross-link)"
```

---

## Task 10: Admin rail (grouped nav, counts, active state)

**Files:**
- Create: `components/admin/admin-rail.tsx`
- Test: `tests/components/admin/admin-rail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/admin-rail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminRail } from "@/components/admin/admin-rail";

const nav = vi.hoisted(() => ({ pathname: "/alex/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

beforeEach(() => {
  nav.pathname = "/alex/admin";
});

describe("AdminRail", () => {
  it("renders both groups with item links", () => {
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /conversations/i })).toHaveAttribute("href", "/alex/admin");
    expect(screen.getByRole("link", { name: /custom domains/i })).toHaveAttribute(
      "href",
      "/alex/admin/settings/domains",
    );
  });

  it("shows the unanswered badge and the conversations count", () => {
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("marks the active item from the current path", () => {
    nav.pathname = "/alex/admin/questions";
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByRole("link", { name: /questions/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /conversations/i })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/admin-rail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/admin-rail.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LABEL } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; count?: number; accentCount?: boolean };
type Group = { title: string; items: Item[] };

export function AdminRail({
  adminBasePath,
  counts,
}: {
  adminBasePath: string;
  counts: { conversations: number; unanswered: number };
}) {
  const pathname = usePathname();
  const groups: Group[] = [
    {
      title: "Activity",
      items: [
        { href: adminBasePath, label: "Conversations", count: counts.conversations },
        {
          href: `${adminBasePath}/questions`,
          label: "Questions",
          count: counts.unanswered || undefined,
          accentCount: true,
        },
        { href: `${adminBasePath}/analytics`, label: "Analytics" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: `${adminBasePath}/settings/content`, label: "Content source" },
        { href: `${adminBasePath}/settings/domains`, label: "Custom domains" },
      ],
    },
  ];

  function isActive(href: string): boolean {
    // The index route must match exactly (it is a prefix of every other route);
    // everything else matches on prefix so query params / sub-paths stay active.
    return href === adminBasePath ? pathname === href : pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Admin sections"
      className="flex w-52 shrink-0 flex-col gap-6 border-r border-[var(--color-border)] px-3 py-6"
    >
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1.5">
          <span className={cn(LABEL, "px-2")} style={{ letterSpacing: "0.18em" }}>
            {g.title}
          </span>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-[var(--color-card)] text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]",
                    )}
                  >
                    <span>{it.label}</span>
                    {it.count != null && (
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          it.accentCount
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-tertiary)]",
                        )}
                      >
                        {it.count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/admin-rail.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/admin-rail.tsx tests/components/admin/admin-rail.test.tsx
git commit -m "feat(admin): grouped left nav rail with counts + active state"
```

---

## Task 11: Admin header (extract + account label)

**Files:**
- Create: `components/admin/admin-header.tsx`
- Test: `tests/components/admin/admin-header.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/admin-header.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminHeader } from "@/components/admin/admin-header";

// ThemeToggle's effect reads window.matchMedia (absent in jsdom) UNLESS
// <html data-theme> is already set. Set it so the effect early-returns.
// (Same workaround the repo uses in tests/components/app-top-bar.test.tsx.)
beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

describe("AdminHeader", () => {
  it("renders the queryme wordmark and the account username", () => {
    render(<AdminHeader username="alex" />);
    expect(screen.getByText("queryme")).toBeInTheDocument();
    expect(screen.getByText("alex")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/admin-header.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/admin/admin-header.tsx`**

Adapt the header JSX from `admin-dashboard.tsx` (lines ~105–128), adding the account username:

```tsx
import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/admin/logout-button";

export function AdminHeader({ username }: { username: string }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
      <h1 className="sr-only">queryme — Admin</h1>
      <div className="flex shrink-0 items-center gap-3">
        <MatriceLogo size={28} animated />
        <div className="flex flex-col leading-tight">
          <span
            className="whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            queryme
          </span>
          <span
            className="whitespace-nowrap font-display text-[14px] font-medium text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            Admin
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]" style={{ letterSpacing: "0.18em" }}>
          {username}
        </span>
        <ThemeToggle label="Switch between light and dark theme" />
        <LogoutButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm vitest run tests/components/admin/admin-header.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/admin-header.tsx tests/components/admin/admin-header.test.tsx
git commit -m "feat(admin): extract admin header with account label"
```

---

## Task 12: Route cutover (layout + nested pages)

**Files:**
- Create: `app/[username]/admin/layout.tsx`, `app/[username]/admin/questions/page.tsx`, `app/[username]/admin/analytics/page.tsx`, `app/[username]/admin/settings/content/page.tsx`, `app/[username]/admin/settings/domains/page.tsx`, `app/[username]/admin/settings/page.tsx`
- Modify: `app/[username]/admin/page.tsx`

> Server-component pages are thin glue (gate → load → render a tested section). They are verified by `pnpm typecheck` + `pnpm build` + the manual smoke in Task 14, not by unit tests — all rendered logic is already covered by Tasks 1–11.

- [ ] **Step 1: Create `app/[username]/admin/layout.tsx`**

```tsx
import { getDb } from "@/lib/db/client";
import { loadAdminCounts } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { GridBackground } from "@/components/grid-background";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminRail } from "@/components/admin/admin-rail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const counts = await loadAdminCounts(getDb(), account.id);
  const adminBasePath = `/${account.username}/admin`;

  return (
    <>
      <GridBackground />
      <div className="relative z-10 flex h-dvh flex-col">
        <AdminHeader username={account.username} />
        <div className="flex min-h-0 flex-1">
          <AdminRail adminBasePath={adminBasePath} counts={counts} />
          <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace `app/[username]/admin/page.tsx` (Conversations route)**

```tsx
import { getDb } from "@/lib/db/client";
import { loadConversations } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ConversationsSection } from "@/components/admin/sections/conversations-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const conversations = await loadConversations(getDb(), account.id);
  return <ConversationsSection conversations={conversations} />;
}
```

- [ ] **Step 3: Create `app/[username]/admin/questions/page.tsx`**

```tsx
import { getDb } from "@/lib/db/client";
import { loadQuestions } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { QuestionsSection } from "@/components/admin/sections/questions-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const questions = await loadQuestions(getDb(), account.id);
  const adminBasePath = `/${account.username}/admin`;
  return (
    <QuestionsSection
      questions={questions}
      apiBasePath={`/api/a/${account.username}/admin`}
      adminBasePath={adminBasePath}
    />
  );
}
```

- [ ] **Step 4: Create `app/[username]/admin/analytics/page.tsx`**

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { AnalyticsSection } from "@/components/admin/sections/analytics-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return <AnalyticsSection apiBasePath={`/api/a/${account.username}/admin`} />;
}
```

- [ ] **Step 5: Create `app/[username]/admin/settings/content/page.tsx`**

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ContentTab } from "@/components/admin/content-tab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return <ContentTab apiBasePath={`/api/a/${account.username}/admin`} />;
}
```

- [ ] **Step 6: Create `app/[username]/admin/settings/domains/page.tsx`**

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { DomainsPanel } from "@/components/admin/domains-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DomainsSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return <DomainsPanel apiBasePath={`/api/a/${account.username}/admin`} />;
}
```

- [ ] **Step 7: Create `app/[username]/admin/settings/page.tsx` (redirect)**

```tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/${username}/admin/settings/content`);
}
```

- [ ] **Step 8: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS — no type errors; build succeeds (Note: `admin-dashboard.tsx` still exists but is now unused; it is removed in Task 13).

- [ ] **Step 9: Commit**

```bash
git add app/[username]/admin
git commit -m "feat(admin): cut admin over to nested routes + shared layout/rail"
```

---

## Task 13: Remove the monolith

**Files:**
- Delete: `components/admin/admin-dashboard.tsx`

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn "admin-dashboard" app components tests`
Expected: no matches (the page now renders `ConversationsSection`).

- [ ] **Step 2: Delete the file**

Run: `git rm components/admin/admin-dashboard.tsx`

- [ ] **Step 3: Full test suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — all tests green, no dangling references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(admin): remove dissolved admin-dashboard monolith"
```

---

## Task 14: Final verification + cleanup

**Files:** none (verification only; small cleanups if anything surfaces)

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 2: Dead-code / duplication scan**

Run: `grep -rn "InterviewerDetail\|InterviewerRow\|ConversationRow\|TabMeta\|TabId" app components | grep -v "rows/conversation-row"`
Expected: no stale references to removed monolith internals (`InterviewerDetail`, `TabMeta`, `TabId`, the old per-tab state). Remove anything that slipped through.

- [ ] **Step 3: Manual smoke (use the `run` skill or `pnpm dev`)**

Sign in as an account owner and verify against the design doc:
1. `/[username]/admin` shows the rail (Activity: Conversations/Questions/Analytics; Settings: Content source/Custom domains) and lands on Conversations.
2. Rail badges: Conversations count + Questions unanswered count (accent) match the data.
3. Conversations `All · Interviewers` filter narrows the list; selecting a row opens the detail; the URL gains `?c=<id>`; reloading keeps the detail open.
4. An identified conversation shows the interviewer-identity block above the transcript in one panel (no extra hop).
5. Questions: selecting a question opens the reply form (`?q=<id>`); "Open conversation →" navigates to `/[username]/admin?c=<id>` and opens that conversation.
6. Analytics, Content source, Custom domains pages render and function as before.
7. Rail active state tracks the current route; deep links (`/[username]/admin/questions`, `?c=`, `?q=`) load correctly on refresh.
8. A non-owner / logged-out user is still 404'd / redirected to login (the gate now lives in `layout.tsx`).

- [ ] **Step 4: Final commit (if cleanups were made)**

```bash
git add -A
git commit -m "chore(admin): final cleanup after IA revamp"
```

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** grouped left rail (Tasks 10, 12) · Activity/Settings groups (10) · Interviewers→Conversations merge as filter (4, 5, 8) · Questions kept separate (9) · deep-linkable nested routes (12) · selected record in URL `?c=`/`?q=` (8, 9) · unified conversation detail (5) · rail counts via `loadAdminCounts` (2, 10) · gate moved to layout (3, 12) · monolith dissolved (1, 4–7, 11, 13) · shared-primitive dedupe (1) · API routes untouched (no task modifies `app/api/**`) · out-of-scope items (visual refresh, new features, mobile) untouched. ✓
- **Placeholder scan:** every code/test step contains complete, runnable content; no TBD/TODO. ✓
- **Type consistency:** `AdminCounts { conversations, unanswered }` is produced by `loadAdminCounts` (Task 2) and consumed by `AdminRail` (Task 10) + layout (Task 12); `requireAdminAccount` returns `Account` (Task 3) used in all pages (Task 12); section prop names (`conversations`, `questions`, `apiBasePath`, `adminBasePath`) match between sections (8, 9) and pages (12); `onOpenConversation` callback matches between `QuestionDetail` (6) and `QuestionsSection` (9). ✓

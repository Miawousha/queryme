# Queryme Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift queryme from a polished single-person CV chat into a feature-complete agentic CV product — close the forward-question loop, deepen the KB, lock answer quality with evals, give the admin a real reply workflow, position the MCP server publicly, ship a server-rendered fallback for search engines, add analytics, make the stack self-hostable, and translate the KB to French.

**Architecture:** Nine independently-shippable sections, ordered by leverage. Each section produces working software on its own and ends with a clean commit. The first section (Forward Loop) and second (KB Content Depth) are prerequisites for several later sections; the rest are independent.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM / Neon Postgres · Upstash Redis (KV) · Vercel AI SDK + Anthropic · Resend (transactional email) · Vitest · pnpm.

**Conventions for every task in this plan:**

- Show the failing test before the implementation.
- Run a single, scoped vitest invocation between steps. Use the exact command shown.
- Commit at the end of each task with the message shown.
- Type-check the project at the end of each section: `pnpm typecheck`.

---

## Section 1 — Close the Forward-Question Loop

**Goal:** When the agent emits `[[forward:...]]` and the visitor confirms, (a) Alexandre is notified by email, (b) the visitor can optionally leave a contact, and (c) the chat surfaces the truth — including the contact path back if one was left.

**Architecture:** Two layers. A new `lib/notify/` module wraps the email provider behind a small interface so the route can stay DI-friendly and tests can swap a fake. The forward route grows a `contact` field, stores it on the row, and fires the notification. The chat's forward button becomes a tiny modal that asks for an optional contact before posting.

**Files:**
- Create: `lib/notify/email.ts`, `tests/lib/notify/email.test.ts`
- Create: `lib/db/migrations/0003_forward_contact.sql`
- Modify: `lib/db/schema.ts`, `lib/db/migrations/meta/_journal.json` (run drizzle-kit generate)
- Modify: `lib/questions/repo.ts`, `tests/lib/questions/repo.test.ts` (new)
- Modify: `app/api/forward-question/route.ts`, `tests/app/api/forward-question/route.test.ts`
- Modify: `components/chat.tsx`, `components/chat-message.tsx`, `tests/components/chat-message.test.tsx`
- Modify: `lib/language.ts` (new strings)

### Task 1.1: Email notifier with a swappable transport

**Files:**
- Create: `lib/notify/email.ts`
- Create: `tests/lib/notify/email.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/notify/email.test.ts
import { describe, it, expect, vi } from "vitest";
import { sendForwardNotification, type EmailTransport } from "@/lib/notify/email";

function makeTransport(): EmailTransport & { sent: Parameters<EmailTransport["send"]>[0][] } {
  const sent: Parameters<EmailTransport["send"]>[0][] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
      return { id: "test-id" };
    },
  };
}

describe("sendForwardNotification", () => {
  it("emails the configured recipient with the question and contact", async () => {
    const t = makeTransport();
    await sendForwardNotification(t, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "What's the cache hit rate at Maxwell?",
      contact: "sarah@acme.example",
      conversationId: "11111111-1111-1111-1111-111111111111",
    });
    expect(t.sent).toHaveLength(1);
    const msg = t.sent[0];
    expect(msg.to).toBe("alex@example.com");
    expect(msg.from).toBe("queryme@example.com");
    expect(msg.subject).toMatch(/forwarded question/i);
    expect(msg.text).toContain("What's the cache hit rate at Maxwell?");
    expect(msg.text).toContain("sarah@acme.example");
    expect(msg.text).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("omits the contact line when none was provided", async () => {
    const t = makeTransport();
    await sendForwardNotification(t, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "Plain question",
      contact: null,
      conversationId: null,
    });
    expect(t.sent[0].text).not.toMatch(/contact/i);
  });

  it("does not throw when the transport rejects — it returns ok:false", async () => {
    const failing: EmailTransport = {
      async send() {
        throw new Error("network");
      },
    };
    const r = await sendForwardNotification(failing, {
      to: "alex@example.com",
      from: "queryme@example.com",
      question: "q",
      contact: null,
      conversationId: null,
    });
    expect(r).toEqual({ ok: false, error: "network" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/notify/email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// lib/notify/email.ts
export type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

export type EmailTransport = {
  send(msg: EmailMessage): Promise<{ id: string }>;
};

export type ForwardNotification = {
  to: string;
  from: string;
  question: string;
  contact: string | null;
  conversationId: string | null;
};

export async function sendForwardNotification(
  transport: EmailTransport,
  input: ForwardNotification,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = [
    `A visitor forwarded a question through queryme.`,
    ``,
    `Question:`,
    input.question,
  ];
  if (input.contact) {
    lines.push(``, `Contact: ${input.contact}`);
  }
  if (input.conversationId) {
    lines.push(``, `Conversation: ${input.conversationId}`);
  }
  const subject = `[queryme] forwarded question`;
  try {
    const r = await transport.send({
      to: input.to,
      from: input.from,
      subject,
      text: lines.join("\n"),
    });
    return { ok: true, id: r.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resend transport. Reads `RESEND_API_KEY` lazily so unit tests can swap a
 * fake transport without setting env. Throws at first use if the key is
 * missing — callers in non-test paths should ensure it is set.
 */
export function resendTransport(): EmailTransport {
  return {
    async send(msg) {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error("RESEND_API_KEY is not set");
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Resend ${r.status}: ${body}`);
      }
      const j = (await r.json()) as { id: string };
      return { id: j.id };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/notify/email.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notify/email.ts tests/lib/notify/email.test.ts
git commit -m "feat(notify): add email notifier with swappable transport"
```

### Task 1.2: Schema migration — add contact column to questions_for_alex

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0003_forward_contact.sql` (via drizzle-kit)

- [ ] **Step 1: Update the Drizzle schema**

Edit `lib/db/schema.ts` — extend `questionsForAlex`:

```ts
export const questionsForAlex = pgTable("questions_for_alex", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  question: text("question").notNull(),
  contact: text("contact"), // optional visitor contact (email / phone / handle)
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `lib/db/migrations/0003_*.sql` file is written that adds the `contact` column.

- [ ] **Step 3: Inspect the SQL**

Open the generated file. It must contain exactly one `ALTER TABLE "questions_for_alex" ADD COLUMN "contact" text;`. If drizzle-kit names it differently (e.g. `0003_silly_x.sql`), rename it to `0003_forward_contact.sql` and update the meta journal entry's `tag` field to match.

- [ ] **Step 4: Apply the migration locally**

Run: `pnpm db:migrate`
Expected: prints `Migration 0003_forward_contact applied`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0003_forward_contact.sql lib/db/migrations/meta/
git commit -m "feat(db): add contact column to questions_for_alex"
```

### Task 1.3: Repo accepts and persists contact

**Files:**
- Modify: `lib/questions/repo.ts`
- Create: `tests/lib/questions/repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/questions/repo.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { forwardQuestion } from "@/lib/questions/repo";

type Row = {
  id: string;
  conversationId: string | null;
  question: string;
  contact: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

function makeDb() {
  const rows: Row[] = [];
  return {
    rows,
    insert() {
      return {
        values(v: { question: string; conversationId?: string; contact?: string | null }) {
          return {
            async returning(): Promise<Row[]> {
              const row: Row = {
                id: `id-${rows.length + 1}`,
                conversationId: v.conversationId ?? null,
                question: v.question,
                contact: v.contact ?? null,
                answeredAt: null,
                createdAt: new Date(),
              };
              rows.push(row);
              return [row];
            },
          };
        },
      };
    },
  };
}

describe("forwardQuestion", () => {
  it("persists the optional contact field when given", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await forwardQuestion(db as any, {
      question: "q",
      conversationId: "00000000-0000-0000-0000-000000000001",
      contact: "sarah@acme.example",
    });
    expect(row.contact).toBe("sarah@acme.example");
  });

  it("persists null contact when omitted", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await forwardQuestion(db as any, { question: "q" });
    expect(row.contact).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/questions/repo.test.ts`
Expected: FAIL — `contact` not on input type.

- [ ] **Step 3: Extend forwardQuestion**

Replace the body of `forwardQuestion` in `lib/questions/repo.ts`:

```ts
export async function forwardQuestion(
  db: Db,
  input: { question: string; conversationId?: string; contact?: string | null },
): Promise<QuestionForAlex> {
  const [inserted] = await db
    .insert(questionsForAlex)
    .values({
      question: input.question,
      conversationId: input.conversationId,
      contact: input.contact ?? null,
    })
    .returning();
  return inserted;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/questions/repo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/questions/repo.ts tests/lib/questions/repo.test.ts
git commit -m "feat(questions): persist optional contact on forwarded questions"
```

### Task 1.4: Route accepts contact, fires notification, stays best-effort

**Files:**
- Modify: `app/api/forward-question/route.ts`
- Modify: `tests/app/api/forward-question/route.test.ts`

- [ ] **Step 1: Read the existing route test to learn its mocking style**

Open `tests/app/api/forward-question/route.test.ts`. Note how it builds requests and mocks `getDb`, `getKv`, `forwardQuestion`. You will reuse those mocks and add a transport injection point.

- [ ] **Step 2: Extend the route to accept DI'd notifier in tests**

Refactor `app/api/forward-question/route.ts` so the email transport can be swapped in tests. Move the actual work to an exported `handleForward` that takes deps, with `POST` as a thin shim:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { forwardQuestion } from "@/lib/questions/repo";
import {
  sendForwardNotification,
  resendTransport,
  type EmailTransport,
} from "@/lib/notify/email";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000),
  contact: z.string().min(3).max(200).optional(),
});

export type ForwardDeps = {
  transport: EmailTransport;
  notifyTo: string;
  notifyFrom: string;
};

export async function handleForward(
  req: NextRequest,
  deps: ForwardDeps,
): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape" }, { status: 400 });
  }
  const kv = getKv();
  const limit = await checkRateLimit(kv, {
    key: `forward:ip:${requestIp(req)}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many forwarded questions" }, { status: 429 });
  }
  const db = getDb();
  const row = await forwardQuestion(db, parsed.data);

  // Best-effort notification. A transport failure must never fail the request:
  // the question is already persisted and the admin can still see it.
  const note = await sendForwardNotification(deps.transport, {
    to: deps.notifyTo,
    from: deps.notifyFrom,
    question: row.question,
    contact: row.contact,
    conversationId: row.conversationId,
  });

  return NextResponse.json({ ok: true, id: row.id, notified: note.ok });
}

export async function POST(req: NextRequest) {
  return handleForward(req, {
    transport: resendTransport(),
    notifyTo: process.env.FORWARD_NOTIFICATION_TO ?? "",
    notifyFrom: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}
```

- [ ] **Step 3: Add tests for the new behaviour**

Append to `tests/app/api/forward-question/route.test.ts`:

```ts
import { handleForward } from "@/app/api/forward-question/route";

function fakeTransport() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    async send(m: { to: string; from: string; subject: string; text: string }) {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: "test" };
    },
  };
}

describe("handleForward — notification side-effect", () => {
  // NOTE: the file's existing `beforeEach` already mocks `getDb`/`getKv`/
  // `forwardQuestion`. Re-use them.

  it("fires the email notifier with the question and contact", async () => {
    const t = fakeTransport();
    const req = makeReq({ question: "How does the cache work?", contact: "sarah@acme.example" });
    const res = await handleForward(req, {
      transport: t,
      notifyTo: "alex@example.com",
      notifyFrom: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("alex@example.com");
    expect(t.sent[0].text).toContain("How does the cache work?");
    expect(t.sent[0].text).toContain("sarah@acme.example");
    const body = await res.json();
    expect(body.notified).toBe(true);
  });

  it("returns ok:true even when the transport fails", async () => {
    const failing = {
      async send() {
        throw new Error("network");
      },
    };
    const req = makeReq({ question: "q" });
    const res = await handleForward(req, {
      transport: failing,
      notifyTo: "alex@example.com",
      notifyFrom: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notified).toBe(false);
  });
});
```

- [ ] **Step 4: Run the route tests**

Run: `pnpm vitest run tests/app/api/forward-question/route.test.ts`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 5: Commit**

```bash
git add app/api/forward-question/route.ts tests/app/api/forward-question/route.test.ts
git commit -m "feat(forward): notify Alexandre via email when a question is forwarded"
```

### Task 1.5: Chat collects optional contact before forwarding

**Files:**
- Modify: `lib/language.ts`
- Modify: `components/chat.tsx`
- Modify: `components/chat-message.tsx`
- Modify: `tests/components/chat-message.test.tsx`

- [ ] **Step 1: Add new strings to both locales**

Edit `lib/language.ts`. Inside each locale's top-level object, add a `forward:` block (do not nest under `forwardAction`):

```ts
// inside `en`
forward: {
  prompt: "Want a reply? Leave a contact (optional).",
  placeholder: "Email or LinkedIn URL",
  send: "Send to Alexandre",
  cancel: "Cancel",
  successWithContact: "Sent. Alexandre will reply at the contact you left.",
  successNoContact: "Sent. Alexandre will see it next time he checks.",
  errorRetry: "Couldn't send — try again.",
},
```

```ts
// inside `fr`
forward: {
  prompt: "Souhaitez-vous une réponse ? Laissez un contact (facultatif).",
  placeholder: "E-mail ou URL LinkedIn",
  send: "Envoyer à Alexandre",
  cancel: "Annuler",
  successWithContact: "Envoyé. Alexandre vous répondra au contact laissé.",
  successNoContact: "Envoyé. Alexandre le verra lors de son prochain passage.",
  errorRetry: "Échec de l'envoi — réessayez.",
},
```

Leave the existing `forwardAction` / `forwardSuccess` / `forwardError` strings alone — they remain the button labels.

- [ ] **Step 2: Write the failing test for the new flow**

Append to `tests/components/chat-message.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("ChatMessage forward modal", () => {
  it("clicking forward opens a contact prompt, submitting calls onForward with question + contact", async () => {
    const onForward = vi.fn();
    render(
      <ChatMessage
        role="assistant"
        text="Here's a thing. [[forward:What's the cache hit rate at Maxwell?]]"
        agentLabel="agent"
        forwardLabel="Forward"
        forwardStrings={{
          prompt: "Want a reply? Leave a contact (optional).",
          placeholder: "Email or LinkedIn URL",
          send: "Send to Alexandre",
          cancel: "Cancel",
        }}
        onForward={onForward}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /forward/i }));
    expect(screen.getByText(/want a reply/i)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/email or linkedin/i), "sarah@acme.example");
    await userEvent.click(screen.getByRole("button", { name: /send to alexandre/i }));
    expect(onForward).toHaveBeenCalledWith(
      "What's the cache hit rate at Maxwell?",
      "sarah@acme.example",
    );
  });

  it("submitting without a contact still forwards with empty contact", async () => {
    const onForward = vi.fn();
    render(
      <ChatMessage
        role="assistant"
        text="[[forward:plain question]]"
        agentLabel="agent"
        forwardLabel="Forward"
        forwardStrings={{
          prompt: "Want a reply? Leave a contact (optional).",
          placeholder: "Email or LinkedIn URL",
          send: "Send to Alexandre",
          cancel: "Cancel",
        }}
        onForward={onForward}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /forward/i }));
    await userEvent.click(screen.getByRole("button", { name: /send to alexandre/i }));
    expect(onForward).toHaveBeenCalledWith("plain question", "");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run tests/components/chat-message.test.tsx`
Expected: FAIL — `forwardStrings` prop unknown, modal not rendered, `onForward` signature mismatch.

- [ ] **Step 4: Extend ChatMessage to render a contact prompt before forwarding**

Edit `components/chat-message.tsx`:

1. Add to `ChatMessageProps`:

```ts
forwardStrings?: {
  prompt: string;
  placeholder: string;
  send: string;
  cancel: string;
};
onForward?: (question: string, contact: string) => void;
```

2. Inside the component, add local state:

```tsx
const [pendingForward, setPendingForward] = useState<string | null>(null);
const [contact, setContact] = useState("");
```

3. Replace the existing forward button render (inside the `forward` chunk branch). The button now opens the modal instead of calling `onForward` directly:

```tsx
case "forward": {
  return (
    <button
      key={i}
      type="button"
      onClick={() => {
        setContact("");
        setPendingForward(chunk.question);
      }}
      className="..."
    >
      {forwardLabel}
    </button>
  );
}
```

4. Render the modal at the bottom of the assistant bubble JSX (only when `pendingForward !== null` and `forwardStrings` is set):

```tsx
{pendingForward !== null && forwardStrings && (
  <div role="dialog" aria-modal="true" className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
    <p className="mb-2 text-xs text-[var(--color-text-secondary)]">{forwardStrings.prompt}</p>
    <input
      type="text"
      value={contact}
      onChange={(e) => setContact(e.target.value)}
      placeholder={forwardStrings.placeholder}
      className="mb-2 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
    />
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => setPendingForward(null)}
        className="rounded px-2 py-1 text-xs text-[var(--color-text-tertiary)]"
      >
        {forwardStrings.cancel}
      </button>
      <button
        type="button"
        onClick={() => {
          onForward?.(pendingForward, contact);
          setPendingForward(null);
        }}
        className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs text-[var(--color-on-primary)]"
      >
        {forwardStrings.send}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Run the chat-message tests**

Run: `pnpm vitest run tests/components/chat-message.test.tsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Wire chat.tsx to send the contact and pick the right toast**

In `components/chat.tsx`:

1. Update the `handleForward` signature:

```tsx
async function handleForward(question: string, contact: string) {
  try {
    const res = await fetch("/api/forward-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        question,
        contact: contact.trim() || undefined,
      }),
    });
    if (!res.ok) {
      setForwardToast(t.forward.errorRetry);
    } else if (contact.trim()) {
      setForwardToast(t.forward.successWithContact);
    } else {
      setForwardToast(t.forward.successNoContact);
    }
  } catch {
    setForwardToast(t.forward.errorRetry);
  }
  setTimeout(() => setForwardToast(null), 4000);
}
```

2. Pass `forwardStrings` to `StreamingMessage` (and from there to `ChatMessage`). In the existing `<StreamingMessage ...>` render add:

```tsx
forwardStrings={t.forward}
```

3. Update `components/streaming-message.tsx`: forward the new prop through to `ChatMessage`. Mirror the existing `forwardLabel` plumbing.

- [ ] **Step 7: Run the full suite**

Run: `pnpm vitest run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add components/chat.tsx components/chat-message.tsx components/streaming-message.tsx lib/language.ts tests/components/chat-message.test.tsx
git commit -m "feat(chat): collect optional contact when forwarding a question"
```

### Task 1.6: Section typecheck

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: no output (clean exit 0).

- [ ] **Step 2: Document the env vars in README**

Append to the existing `## Environment` section (or create one) in `README.md`:

```markdown
- `RESEND_API_KEY` — API key for the Resend transactional-email service.
- `FORWARD_NOTIFICATION_TO` — email address that receives forwarded questions.
- `FORWARD_NOTIFICATION_FROM` — verified sender address used as the `from`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document forward-notification env vars"
```

---

## Section 2 — KB Content Depth: New Section Types

**Goal:** Add three new KB section types — `talks/`, `open-source/`, `recommendations/` — with full schema/loader/assembler/test parity, plus one seed entry per type so the structure is exercised end-to-end. Section 2 ships infrastructure + fixtures; filling each section with real content is an out-of-band authoring task done after merge.

**Architecture:** Each new section type follows the existing `experience/` pattern: Zod schema for frontmatter, loader reads the folder, assembler renders it with a `[ref: <path>]` marker, KB-pipeline tests + fixtures cover it. Tests must exercise the *contract* (presence of section, `[ref:]` marker, sort order), not the literal content.

**Files:**
- Modify: `lib/kb/schemas.ts`, `lib/kb/loader.ts`, `lib/kb/assembler.ts`, `lib/kb/file-type.ts`
- Create: `kb/talks/`, `kb/open-source/`, `kb/recommendations/` + one seed file each
- Create: `tests/fixtures/kb/talks/`, `tests/fixtures/kb/open-source/`, `tests/fixtures/kb/recommendations/` + one fixture file each
- Modify: `tests/lib/kb/loader.test.ts`, `tests/lib/kb/assembler.test.ts`, `tests/lib/kb/schemas.test.ts`

### Task 2.1: Schemas for the three new section types

**Files:**
- Modify: `lib/kb/schemas.ts`
- Modify: `tests/lib/kb/schemas.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/lib/kb/schemas.test.ts`:

```ts
import {
  TalkFrontmatterSchema,
  OpenSourceFrontmatterSchema,
  RecommendationFrontmatterSchema,
} from "@/lib/kb/schemas";

describe("TalkFrontmatterSchema", () => {
  it("accepts a minimal talk", () => {
    expect(() =>
      TalkFrontmatterSchema.parse({
        title: "Battery emulation at scale",
        venue: "EVS37",
        year: 2024,
      }),
    ).not.toThrow();
  });
  it("rejects a talk missing title or venue", () => {
    expect(() => TalkFrontmatterSchema.parse({ venue: "X", year: 2024 })).toThrow();
    expect(() => TalkFrontmatterSchema.parse({ title: "T", year: 2024 })).toThrow();
  });
});

describe("OpenSourceFrontmatterSchema", () => {
  it("accepts a minimal project", () => {
    expect(() =>
      OpenSourceFrontmatterSchema.parse({
        name: "queryme",
        url: "https://github.com/Miawousha/queryme",
        role: "author",
      }),
    ).not.toThrow();
  });
  it("rejects an invalid role", () => {
    expect(() =>
      OpenSourceFrontmatterSchema.parse({
        name: "x",
        url: "https://example.com/x",
        role: "owner",
      }),
    ).toThrow();
  });
});

describe("RecommendationFrontmatterSchema", () => {
  it("accepts a minimal recommendation", () => {
    expect(() =>
      RecommendationFrontmatterSchema.parse({
        from: "Jane Doe",
        title: "VP Engineering at Acme",
        date: "2024-09",
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/schemas.test.ts`
Expected: FAIL — schemas not exported.

- [ ] **Step 3: Add the three schemas**

Append to `lib/kb/schemas.ts`:

```ts
export const TalkFrontmatterSchema = z.object({
  title: z.string().min(1),
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  location: z.string().optional(),
  url: z.url().optional(),
  tags: z.array(z.string()).optional(),
});
export type TalkFrontmatter = z.infer<typeof TalkFrontmatterSchema>;

export const OpenSourceFrontmatterSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  role: z.enum(["author", "maintainer", "contributor"]),
  description: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  tags: z.array(z.string()).optional(),
});
export type OpenSourceFrontmatter = z.infer<typeof OpenSourceFrontmatterSchema>;

export const RecommendationFrontmatterSchema = z.object({
  from: z.string().min(1),
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}$/),
  relationship: z.string().optional(),
  url: z.url().optional(),
});
export type RecommendationFrontmatter = z.infer<typeof RecommendationFrontmatterSchema>;
```

- [ ] **Step 4: Run tests to verify**

Run: `pnpm vitest run tests/lib/kb/schemas.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/schemas.ts tests/lib/kb/schemas.test.ts
git commit -m "feat(kb): add schemas for talks, open-source, recommendations"
```

### Task 2.2: Loader reads the new directories

**Files:**
- Modify: `lib/kb/loader.ts`
- Modify: `tests/lib/kb/loader.test.ts`
- Create: `tests/fixtures/kb/talks/2024-evs37.md`
- Create: `tests/fixtures/kb/open-source/queryme.md`
- Create: `tests/fixtures/kb/recommendations/2024-09-jane-doe.md`

- [ ] **Step 1: Add the three fixture files**

`tests/fixtures/kb/talks/2024-evs37.md`:

```markdown
---
title: "Battery emulation at scale"
venue: "EVS37"
year: 2024
location: "Seoul"
tags: [battery, talk]
---

Talk body — what was presented and why.
```

`tests/fixtures/kb/open-source/queryme.md`:

```markdown
---
name: queryme
url: https://github.com/Miawousha/queryme
role: author
description: An agent-driven CV.
year: 2026
tags: [ai, software]
---

Project body — what it is and contributors.
```

`tests/fixtures/kb/recommendations/2024-09-jane-doe.md`:

```markdown
---
from: "Jane Doe"
title: "VP Engineering at Acme"
date: "2024-09"
relationship: "Direct manager 2022-2024"
---

> Alexandre is the engineer I'd want building anything that has to ship and keep shipping.
```

- [ ] **Step 2: Extend the Kb type and load function**

Edit `lib/kb/loader.ts`:

1. Add to the imports:

```ts
import {
  TalkFrontmatterSchema,
  OpenSourceFrontmatterSchema,
  RecommendationFrontmatterSchema,
  type TalkFrontmatter,
  type OpenSourceFrontmatter,
  type RecommendationFrontmatter,
} from "./schemas";
```

2. Add entry types under the existing `ExperienceEntry`:

```ts
export type TalkEntry = {
  slug: string;
  relativePath: string;
  frontmatter: TalkFrontmatter;
  body: string;
};

export type OpenSourceEntry = {
  slug: string;
  relativePath: string;
  frontmatter: OpenSourceFrontmatter;
  body: string;
};

export type RecommendationEntry = {
  slug: string;
  relativePath: string;
  frontmatter: RecommendationFrontmatter;
  body: string;
};
```

3. Extend the `Kb` type:

```ts
export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  talks: TalkEntry[];
  openSource: OpenSourceEntry[];
  recommendations: RecommendationEntry[];
};
```

4. Extend the `Promise.all` block inside `loadKb`:

```ts
const [
  profile, skills, education, publicContact,
  experience, projects,
  talks, openSource, recommendations,
] = await Promise.all([
  readYamlFile(path.join(rootDir, "profile.yaml"), ProfileSchema, "profile.yaml"),
  readYamlFile(path.join(rootDir, "skills.yaml"), SkillsSchema, "skills.yaml"),
  readYamlFile(path.join(rootDir, "education.yaml"), EducationSchema, "education.yaml"),
  readYamlFile(path.join(rootDir, "public-contact.yaml"), PublicContactSchema, "public-contact.yaml"),
  readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience"),
  readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects"),
  readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks"),
  readMarkdownDir(path.join(rootDir, "open-source"), OpenSourceFrontmatterSchema, "open-source"),
  readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations"),
]);
```

5. Add sorts after the existing experience/projects sorts:

```ts
talks.sort((a, b) => b.frontmatter.year - a.frontmatter.year);
openSource.sort((a, b) =>
  (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0) || a.frontmatter.name.localeCompare(b.frontmatter.name),
);
recommendations.sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));
```

6. Add to the return:

```ts
return { profile, skills, education, publicContact, experience, projects, talks, openSource, recommendations };
```

- [ ] **Step 3: Extend loader tests**

Append to `tests/lib/kb/loader.test.ts` (inside the existing `describe("loadKb", ...)`):

```ts
it("loads talks, open-source, and recommendations entries", async () => {
  const kb = await loadKb(FIXTURE_DIR);
  expect(kb.talks).toHaveLength(1);
  expect(kb.talks[0].frontmatter.title).toBe("Battery emulation at scale");
  expect(kb.talks[0].relativePath).toBe("talks/2024-evs37.md");

  expect(kb.openSource).toHaveLength(1);
  expect(kb.openSource[0].frontmatter.name).toBe("queryme");
  expect(kb.openSource[0].relativePath).toBe("open-source/queryme.md");

  expect(kb.recommendations).toHaveLength(1);
  expect(kb.recommendations[0].frontmatter.from).toBe("Jane Doe");
  expect(kb.recommendations[0].relativePath).toBe("recommendations/2024-09-jane-doe.md");
});
```

- [ ] **Step 4: Run loader tests**

Run: `pnpm vitest run tests/lib/kb/loader.test.ts`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/loader.ts tests/lib/kb/loader.test.ts tests/fixtures/kb/talks/ tests/fixtures/kb/open-source/ tests/fixtures/kb/recommendations/
git commit -m "feat(kb): loader supports talks, open-source, recommendations"
```

### Task 2.3: Assembler renders the three new sections

**Files:**
- Modify: `lib/kb/assembler.ts`
- Modify: `tests/lib/kb/assembler.test.ts`

- [ ] **Step 1: Write failing assembler tests**

Append to `tests/lib/kb/assembler.test.ts`:

```ts
it("includes a Talks section with [ref: talks/...] markers when talks exist", () => {
  const text = assemblePublicKbText(kb);
  expect(text).toContain("# Talks");
  expect(text).toContain("[ref: talks/2024-evs37.md]");
  expect(text).toContain("Battery emulation at scale");
  expect(text).toContain("EVS37");
});

it("includes an Open source section with [ref: open-source/...] markers", () => {
  const text = assemblePublicKbText(kb);
  expect(text).toContain("# Open source");
  expect(text).toContain("[ref: open-source/queryme.md]");
  expect(text).toContain("queryme");
});

it("includes a Recommendations section with [ref: recommendations/...] markers", () => {
  const text = assemblePublicKbText(kb);
  expect(text).toContain("# Recommendations");
  expect(text).toContain("[ref: recommendations/2024-09-jane-doe.md]");
  expect(text).toContain("Jane Doe");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/lib/kb/assembler.test.ts`
Expected: FAIL — sections missing.

- [ ] **Step 3: Add renderers and section appends**

Edit `lib/kb/assembler.ts`. In `assemblePublicKbText`, append after `renderProjects(kb)`:

```ts
if (kb.talks.length) sections.push(renderTalks(kb));
if (kb.openSource.length) sections.push(renderOpenSource(kb));
if (kb.recommendations.length) sections.push(renderRecommendations(kb));
```

Add at the bottom of the file:

```ts
function renderTalks(kb: Kb): string {
  const lines = [`# Talks`, ``];
  for (const t of kb.talks) {
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

function renderOpenSource(kb: Kb): string {
  const lines = [`# Open source`, ``];
  for (const p of kb.openSource) {
    lines.push(`## ${p.frontmatter.name}`);
    lines.push(`[ref: ${p.relativePath}]`);
    lines.push(`Role: ${p.frontmatter.role}`);
    lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.description) lines.push(`Description: ${p.frontmatter.description}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``, p.body, ``);
  }
  return lines.join("\n");
}

function renderRecommendations(kb: Kb): string {
  const lines = [`# Recommendations`, ``];
  for (const r of kb.recommendations) {
    lines.push(`## ${r.frontmatter.from} — ${r.frontmatter.title} (${r.frontmatter.date})`);
    lines.push(`[ref: ${r.relativePath}]`);
    if (r.frontmatter.relationship) lines.push(`Relationship: ${r.frontmatter.relationship}`);
    lines.push(``, r.body, ``);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify**

Run: `pnpm vitest run tests/lib/kb/assembler.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Update file-type classifier**

Edit `lib/kb/file-type.ts` so the KB panel recognises the new folders. Without seeing the file, the change is to extend whatever map / regex classifies a relative path into a category. Add three entries that map paths starting with `talks/`, `open-source/`, `recommendations/` to a new `KbFileType` value (e.g. `"talk"`, `"open-source"`, `"recommendation"` — or reuse `"document"` if the existing enum is closed).

If the existing enum is closed, the minimal change is:

```ts
// add to the union type
export type KbFileType =
  | "profile" | "skills" | "education" | "public-contact"
  | "experience" | "project"
  | "talk" | "open-source" | "recommendation";

// add to the path → type switch
if (p.startsWith("talks/")) return "talk";
if (p.startsWith("open-source/")) return "open-source";
if (p.startsWith("recommendations/")) return "recommendation";
```

- [ ] **Step 6: Add file-type tests**

Append to `tests/lib/kb/file-type.test.ts`:

```ts
it("classifies talks/, open-source/, recommendations/", () => {
  expect(fileTypeFromPath("talks/2024-evs37.md")).toBe("talk");
  expect(fileTypeFromPath("open-source/queryme.md")).toBe("open-source");
  expect(fileTypeFromPath("recommendations/2024-09-jane-doe.md")).toBe("recommendation");
});
```

- [ ] **Step 7: Run all KB tests**

Run: `pnpm vitest run tests/lib/kb/`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add lib/kb/assembler.ts lib/kb/file-type.ts tests/lib/kb/
git commit -m "feat(kb): render talks, open-source, recommendations in assembler"
```

### Task 2.4: Seed each real KB folder with at least one entry

**Files:**
- Create: `kb/talks/.gitkeep` or one real entry
- Create: `kb/open-source/queryme.md`
- Create: `kb/recommendations/.gitkeep` or one real entry

- [ ] **Step 1: Create the directories and one seed file each**

`kb/open-source/queryme.md`:

```markdown
---
name: queryme
url: https://github.com/Miawousha/queryme
role: author
description: "Agent-driven CV — answers questions about Alexandre from a YAML/Markdown knowledge base."
year: 2026
tags: [ai, software, typescript, nextjs]
---

queryme is the system serving this page. Built with Next.js 15, the Vercel AI
SDK, Drizzle ORM on Neon Postgres, and a Streamable-HTTP MCP server so other
agents can ask about Alexandre directly.
```

For `kb/talks/` and `kb/recommendations/`, create empty placeholder directories the assembler will simply skip until content is added:

```bash
mkdir -p kb/talks kb/recommendations
touch kb/talks/.gitkeep kb/recommendations/.gitkeep
```

- [ ] **Step 2: Run validate-kb**

Run: `pnpm tsx scripts/validate-kb.ts`
Expected: passes.

- [ ] **Step 3: Run the full suite**

Run: `pnpm vitest run`
Expected: all green.

- [ ] **Step 4: Section typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add kb/
git commit -m "feat(kb): seed open-source section with queryme entry"
```

---

## Section 3 — Eval Harness

**Goal:** A repeatable command that runs N golden questions against the real `answer()` pipeline (with a real or stub model) and reports whether each required citation appeared, no forbidden phrase appeared, and the answer was non-empty. Failure should be loud and machine-readable so CI can gate prompt or KB changes.

**Architecture:** Evals live under `evals/`. Each YAML file describes one question, its expected language, must-cite paths (filenames the answer is required to reference), must-contain / must-not-contain substrings, and a confidence note. A runner script invokes `answer()` with a mock model in unit-test mode (fast, deterministic) AND, when a live key is present, against the real model. The runner emits a JSON report + a human summary.

**Files:**
- Create: `evals/questions/01-most-recent-role.yaml`, `02-battery-management.yaml`, `03-contact.yaml` (seed set; expand later)
- Create: `evals/schema.ts`, `evals/run.ts`, `evals/index.ts`
- Create: `scripts/eval.ts`
- Create: `tests/evals/run.test.ts`
- Modify: `package.json` (new script `evals`)

### Task 3.1: Eval schema + loader

**Files:**
- Create: `evals/schema.ts`, `evals/index.ts`
- Create: `tests/evals/index.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/evals/index.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadEvals } from "@/evals/index";

describe("loadEvals", () => {
  it("parses every YAML in the directory and validates the shape", async () => {
    const dir = path.resolve(__dirname, "../fixtures/evals");
    const evals = await loadEvals(dir);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toMatchObject({
      id: "01-fixture",
      question: "What is X?",
      language: "en",
      mustCite: ["profile.yaml"],
      mustContain: ["fixture"],
      mustNotContain: ["forbidden"],
    });
  });
});
```

Create the fixture: `tests/fixtures/evals/01-fixture.yaml`:

```yaml
id: 01-fixture
question: "What is X?"
language: en
mustCite:
  - profile.yaml
mustContain:
  - fixture
mustNotContain:
  - forbidden
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/evals/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema and loader**

```ts
// evals/schema.ts
import { z } from "zod";

export const EvalQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  language: z.enum(["en", "fr"]).default("en"),
  mustCite: z.array(z.string()).default([]),
  mustContain: z.array(z.string()).default([]),
  mustNotContain: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>;
```

```ts
// evals/index.ts
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { EvalQuestionSchema, type EvalQuestion } from "./schema";

export async function loadEvals(dir: string): Promise<EvalQuestion[]> {
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const out: EvalQuestion[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    out.push(EvalQuestionSchema.parse(parseYaml(raw)));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/evals/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add evals/schema.ts evals/index.ts tests/evals/ tests/fixtures/evals/
git commit -m "feat(evals): add schema and loader for golden questions"
```

### Task 3.2: Eval runner — assertions over a single completion

**Files:**
- Create: `evals/run.ts`
- Create: `tests/evals/run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/evals/run.test.ts
import { describe, it, expect } from "vitest";
import { evaluateAnswer } from "@/evals/run";

const baseQuestion = {
  id: "x",
  question: "Q",
  language: "en" as const,
  mustCite: ["profile.yaml"],
  mustContain: ["Alexandre"],
  mustNotContain: ["never"],
};

describe("evaluateAnswer", () => {
  it("passes when every required citation and phrase is present", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre is real [^kb:profile.yaml].");
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails with a specific reason when a required citation is missing", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre is real.");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("profile.yaml"))).toBe(true);
  });

  it("fails when a forbidden phrase appears", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre never did that [^kb:profile.yaml].");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("never"))).toBe(true);
  });

  it("fails when a required phrase is missing", () => {
    const r = evaluateAnswer(baseQuestion, "Someone real [^kb:profile.yaml].");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Alexandre"))).toBe(true);
  });

  it("fails on empty answer", () => {
    const r = evaluateAnswer(baseQuestion, "");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.toLowerCase().includes("empty"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/evals/run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement evaluateAnswer**

```ts
// evals/run.ts
import { parseCitations } from "@/lib/kb/citations";
import type { EvalQuestion } from "./schema";

export type EvalResult = {
  id: string;
  passed: boolean;
  failures: string[];
  answer: string;
};

export function evaluateAnswer(q: EvalQuestion, answer: string): EvalResult {
  const failures: string[] = [];
  const text = answer.trim();
  if (!text) {
    failures.push("answer is empty");
    return { id: q.id, passed: false, failures, answer };
  }
  const cited = new Set(parseCitations(answer).map((c) => c.path));
  for (const required of q.mustCite) {
    if (!cited.has(required)) {
      failures.push(`missing required citation: ${required}`);
    }
  }
  for (const phrase of q.mustContain) {
    if (!answer.includes(phrase)) {
      failures.push(`missing required phrase: ${phrase}`);
    }
  }
  for (const phrase of q.mustNotContain) {
    if (answer.includes(phrase)) {
      failures.push(`forbidden phrase present: ${phrase}`);
    }
  }
  return { id: q.id, passed: failures.length === 0, failures, answer };
}
```

- [ ] **Step 4: Run test to verify**

Run: `pnpm vitest run tests/evals/run.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/run.ts tests/evals/run.test.ts
git commit -m "feat(evals): add evaluator that scores citations and required phrases"
```

### Task 3.3: CLI script that runs evals against a live model

**Files:**
- Create: `scripts/eval.ts`
- Create: `evals/questions/01-most-recent-role.yaml`
- Create: `evals/questions/02-battery-management.yaml`
- Create: `evals/questions/03-contact.yaml`
- Modify: `package.json`

- [ ] **Step 1: Seed three golden questions**

`evals/questions/01-most-recent-role.yaml`:

```yaml
id: 01-most-recent-role
question: What is Alexandre's most recent role?
language: en
mustCite:
  - experience/2025-altergo.md
mustContain:
  - Altergo
mustNotContain:
  - I am Alexandre
```

`evals/questions/02-battery-management.yaml`:

```yaml
id: 02-battery-management
question: How much battery-management experience does Alexandre have?
language: en
mustCite:
  - skills.yaml
mustContain:
  - 15
mustNotContain: []
```

`evals/questions/03-contact.yaml`:

```yaml
id: 03-contact
question: How do I contact Alexandre?
language: en
mustCite:
  - public-contact.yaml
mustContain:
  - linkedin
mustNotContain: []
```

- [ ] **Step 2: Write the runner CLI**

```ts
// scripts/eval.ts
/* Runs every YAML under `evals/questions/` through `answer()` against the
 * real model. Requires ANTHROPIC_API_KEY. Exits non-zero if any eval fails. */
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { loadEvals } from "@/evals/index";
import { evaluateAnswer, type EvalResult } from "@/evals/run";

async function readStreamToText(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

async function main() {
  const root = process.cwd();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(2);
  }
  const kb = await loadKb(path.join(root, "kb"));
  const kbText = assemblePublicKbText(kb);
  const questions = await loadEvals(path.join(root, "evals/questions"));

  const results: EvalResult[] = [];
  for (const q of questions) {
    process.stderr.write(`▶ ${q.id} … `);
    const stream = await answer({
      messages: [{ role: "user", content: q.question }],
      kbText,
    });
    const text = await readStreamToText(stream.textStream);
    const r = evaluateAnswer(q, text);
    results.push(r);
    process.stderr.write(r.passed ? "PASS\n" : `FAIL (${r.failures.join("; ")})\n`);
  }

  const failed = results.filter((r) => !r.passed);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
```

- [ ] **Step 3: Add the npm script**

Edit `package.json` `scripts`:

```json
"evals": "tsx scripts/eval.ts"
```

- [ ] **Step 4: Smoke-test the CLI (live; gated on key)**

If `ANTHROPIC_API_KEY` is set locally, run: `pnpm evals`
Expected: prints JSON summary, exits 0 if all 3 pass.

If the key is not available, skip this step — the unit tests cover the evaluator contract.

- [ ] **Step 5: Commit**

```bash
git add evals/questions/ scripts/eval.ts package.json
git commit -m "feat(evals): add CLI runner and seed three golden questions"
```

### Task 3.4: Document the eval harness

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section to README.md**

Append:

```markdown
## Evals

Golden-question regression suite. Each YAML under `evals/questions/` describes a
question, the KB files the answer must cite, phrases that must appear, and
phrases that must not. Run them against the live model:

    ANTHROPIC_API_KEY=... pnpm evals

Exits non-zero on any failure. Add new questions by dropping a new `*.yaml` in
the folder.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the evals harness"
```

---

## Section 4 — Admin Reply Workflow

**Goal:** The admin can reply to a forwarded question from the dashboard; if the visitor left a contact, the reply is emailed to them. Marking a question answered without a body is disallowed — every "answered" question has a recorded reply.

**Architecture:** Extend `questions_for_alex` with a `reply` text column. New API route `POST /api/admin/questions/[id]/reply` is admin-gated, persists the reply, sets `answeredAt`, and (when `contact` is set) sends an email via the same `EmailTransport` interface from Section 1. The admin UI grows a reply textarea + send button inside `QuestionDetail`.

**Files:**
- Create: `lib/db/migrations/0004_question_reply.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/questions/repo.ts`, `tests/lib/questions/repo.test.ts`
- Create: `app/api/admin/questions/[id]/reply/route.ts`
- Create: `tests/app/api/admin/questions/reply/route.test.ts`
- Modify: `components/admin/admin-dashboard.tsx` (QuestionDetail)
- Modify: `lib/admin/data.ts` to include `reply` field

### Task 4.1: Schema + repo `recordReply`

- [ ] **Step 1: Extend the schema**

In `lib/db/schema.ts`, extend `questionsForAlex`:

```ts
export const questionsForAlex = pgTable("questions_for_alex", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  question: text("question").notNull(),
  contact: text("contact"),
  reply: text("reply"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate + apply migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: a new `0004_*.sql` applied. Rename it to `0004_question_reply.sql` and update `meta/_journal.json` tag to match.

- [ ] **Step 3: Write the failing repo test**

Append to `tests/lib/questions/repo.test.ts`:

```ts
import { recordReply } from "@/lib/questions/repo";

describe("recordReply", () => {
  function makeDb() {
    const rows = [{ id: "q1", question: "q", reply: null as string | null, answeredAt: null as Date | null, contact: null as string | null, conversationId: null as string | null, createdAt: new Date() }];
    return {
      rows,
      update() {
        return {
          set(v: { reply: string; answeredAt: Date }) {
            return {
              where() {
                return {
                  async returning() {
                    rows[0].reply = v.reply;
                    rows[0].answeredAt = v.answeredAt;
                    return [rows[0]];
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  it("persists reply text and stamps answered_at", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await recordReply(db as any, "q1", "Thanks for asking — here's the answer.");
    expect(r.reply).toBe("Thanks for asking — here's the answer.");
    expect(r.answeredAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/questions/repo.test.ts`
Expected: FAIL — `recordReply` not exported.

- [ ] **Step 5: Implement recordReply**

Append to `lib/questions/repo.ts`:

```ts
import { eq } from "drizzle-orm";

export async function recordReply(
  db: Db,
  id: string,
  reply: string,
): Promise<QuestionForAlex> {
  const [updated] = await db
    .update(questionsForAlex)
    .set({ reply, answeredAt: new Date() })
    .where(eq(questionsForAlex.id, id))
    .returning();
  if (!updated) throw new Error(`recordReply: no row with id ${id}`);
  return updated;
}
```

- [ ] **Step 6: Run test to verify**

Run: `pnpm vitest run tests/lib/questions/repo.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0004_question_reply.sql lib/db/migrations/meta/ lib/questions/repo.ts tests/lib/questions/repo.test.ts
git commit -m "feat(db): add reply column and recordReply"
```

### Task 4.2: Admin reply API route

**Files:**
- Create: `app/api/admin/questions/[id]/reply/route.ts`
- Create: `tests/app/api/admin/questions/reply/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/admin/questions/reply/route.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleReply } from "@/app/api/admin/questions/[id]/reply/route";

vi.mock("@/lib/admin/auth", () => ({
  isAdminAuthenticated: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/questions/repo", () => ({
  recordReply: vi.fn(),
  getQuestion: vi.fn(),
}));

import { isAdminAuthenticated } from "@/lib/admin/auth";
import { recordReply, getQuestion } from "@/lib/questions/repo";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/questions/q1/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeTransport() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    async send(m: { to: string; from: string; subject: string; text: string }) {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
      return { id: "x" };
    },
  };
}

describe("POST /api/admin/questions/[id]/reply", () => {
  it("401s when not admin", async () => {
    (isAdminAuthenticated as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await handleReply(req({ reply: "hi" }), { params: { id: "q1" } }, {
      transport: fakeTransport(),
      from: "queryme@example.com",
    });
    expect(res.status).toBe(401);
  });

  it("400s on empty reply", async () => {
    (isAdminAuthenticated as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const res = await handleReply(req({ reply: "" }), { params: { id: "q1" } }, {
      transport: fakeTransport(),
      from: "queryme@example.com",
    });
    expect(res.status).toBe(400);
  });

  it("persists, then emails the contact when present", async () => {
    (isAdminAuthenticated as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getQuestion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "q1",
      question: "Q",
      contact: "sarah@acme.example",
      reply: null,
      answeredAt: null,
      conversationId: null,
      createdAt: new Date(),
    });
    (recordReply as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "q1",
      question: "Q",
      contact: "sarah@acme.example",
      reply: "A",
      answeredAt: new Date(),
      conversationId: null,
      createdAt: new Date(),
    });
    const t = fakeTransport();
    const res = await handleReply(req({ reply: "A" }), { params: { id: "q1" } }, {
      transport: t,
      from: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(recordReply).toHaveBeenCalledWith({}, "q1", "A");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("sarah@acme.example");
    expect(t.sent[0].text).toContain("A");
  });

  it("does not email when there is no contact", async () => {
    (isAdminAuthenticated as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getQuestion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "q1", question: "Q", contact: null, reply: null, answeredAt: null,
      conversationId: null, createdAt: new Date(),
    });
    (recordReply as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "q1", question: "Q", contact: null, reply: "A", answeredAt: new Date(),
      conversationId: null, createdAt: new Date(),
    });
    const t = fakeTransport();
    const res = await handleReply(req({ reply: "A" }), { params: { id: "q1" } }, {
      transport: t,
      from: "queryme@example.com",
    });
    expect(res.status).toBe(200);
    expect(t.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/api/admin/questions/reply/route.test.ts`
Expected: FAIL — route module not found, `getQuestion` not exported.

- [ ] **Step 3: Add `getQuestion` to the repo**

Append to `lib/questions/repo.ts`:

```ts
export async function getQuestion(db: Db, id: string): Promise<QuestionForAlex | null> {
  const rows = await db
    .select()
    .from(questionsForAlex)
    .where(eq(questionsForAlex.id, id))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Implement the route**

```ts
// app/api/admin/questions/[id]/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { getQuestion, recordReply } from "@/lib/questions/repo";
import { resendTransport, type EmailTransport } from "@/lib/notify/email";

export const runtime = "nodejs";

const Body = z.object({ reply: z.string().min(1).max(20000) });

export type ReplyDeps = {
  transport: EmailTransport;
  from: string;
};

export async function handleReply(
  req: NextRequest,
  ctx: { params: { id: string } },
  deps: ReplyDeps,
): Promise<NextResponse> {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const db = getDb();
  const existing = await getQuestion(db, ctx.params.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await recordReply(db, ctx.params.id, parsed.data.reply);
  if (existing.contact) {
    try {
      await deps.transport.send({
        to: existing.contact,
        from: deps.from,
        subject: "Alexandre replied to your forwarded question",
        text:
          `You asked:\n\n${existing.question}\n\n` +
          `Alexandre replied:\n\n${updated.reply}\n`,
      });
    } catch {
      // Best-effort. Reply is already persisted; admin can resend manually.
    }
  }
  return NextResponse.json({ ok: true, id: updated.id });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return handleReply(req, ctx, {
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}
```

- [ ] **Step 5: Run test to verify**

Run: `pnpm vitest run tests/app/api/admin/questions/reply/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/questions/ lib/questions/repo.ts tests/app/api/admin/questions/
git commit -m "feat(admin): add reply route that persists and emails the visitor"
```

### Task 4.3: Admin UI — reply form in QuestionDetail

**Files:**
- Modify: `lib/admin/data.ts` (expose `reply` field on `QuestionForAlex`)
- Modify: `components/admin/admin-dashboard.tsx`

- [ ] **Step 1: Extend admin data**

Confirm `QuestionForAlex` shape is automatically extended via the schema export (Drizzle `$inferSelect`). Check `lib/admin/data.ts` only needs to forward the new `reply` field — likely no change required if it already returns the full row.

If `lib/admin/data.ts` projects specific fields, add `reply` and `contact` to the projection.

- [ ] **Step 2: Extend QuestionDetail to render the existing reply and an editor**

In `components/admin/admin-dashboard.tsx`, replace the `QuestionDetail` component:

```tsx
function QuestionDetail({
  question,
  onOpenConversation,
}: {
  question: QuestionForAlex;
  onOpenConversation: (conversationId: string) => void;
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
      const res = await fetch(`/api/admin/questions/${question.id}/reply`, {
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
        {savedAt ? <Badge>answered</Badge> : (
          <span className="rounded-full border border-[var(--color-accent)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-accent)]" style={{ letterSpacing: "0.16em" }}>
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
      {question.contact && (
        <Field label="Visitor contact" value={question.contact} />
      )}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Reply</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="rounded-md border border-[var(--color-border)] bg-transparent p-2 text-[13px]"
          placeholder="Write the reply Alexandre wants to send…"
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

- [ ] **Step 3: Run full suite + typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add components/admin/admin-dashboard.tsx lib/admin/data.ts
git commit -m "feat(admin): reply textarea in QuestionDetail wires to /reply route"
```

---

## Section 5 — MCP Positioning & Public Docs

**Goal:** Make the MCP endpoint discoverable and copy-pasteable for any agent. Land `docs/MCP.md` with concrete connector configs (Claude Desktop, Cursor, generic Streamable-HTTP) and link it from the README and the in-app About popover.

**Architecture:** Pure documentation + a static config block in the in-app `McpModal`. No runtime code changes beyond exposing a stable, documented URL.

**Files:**
- Create: `docs/MCP.md`
- Modify: `README.md`
- Modify: `components/about-popover.tsx` (add link to docs/MCP.md)
- Modify: `lib/language.ts` if any new strings are needed (none mandatory; the existing `mcp.intro` block covers it)

### Task 5.1: Write docs/MCP.md

- [ ] **Step 1: Create the file**

```markdown
# Querying queryme over MCP

queryme exposes a Streamable-HTTP Model Context Protocol endpoint so other
agents can ask about Alexandre directly — no scraping, no copy-pasting.

## Endpoint

    https://<your-deploy>/api/mcp

The endpoint speaks the standard MCP Streamable-HTTP transport. Sessions are
short-lived; pass the `conversationId` returned from your first `ask` call into
subsequent calls if you want a continuous thread.

## Tools

- `ask` — Ask a question. Returns text + a conversationId.
- `forward_question` — Leave a question for Alexandre to answer later. Returns the queued id.

## Connector configurations

### Claude Desktop

Add to `claude_desktop_config.json`:

    {
      "mcpServers": {
        "queryme": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "https://<your-deploy>/api/mcp"]
        }
      }
    }

### Cursor, Windsurf, and other JSON-config clients

Same `mcpServers` block as Claude Desktop. Drop it into the client's MCP
settings file.

### Direct HTTP (curl)

A minimal `ask` invocation, for debugging:

    curl -N -X POST https://<your-deploy>/api/mcp \
      -H 'content-type: application/json' \
      -H 'accept: text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ask","arguments":{"question":"What is Alexandre most known for?"}}}'

## Rate limits

The MCP endpoint shares the same per-IP rate limit as the public chat: 30
requests / 10 minutes. Exceeded calls return an MCP error with code 429.
```

- [ ] **Step 2: Link from README.md**

Append to `README.md`:

```markdown
## Talk to it from your own agent

queryme is also an MCP server. See [docs/MCP.md](docs/MCP.md) for connector
configs (Claude Desktop, Cursor, raw HTTP).
```

- [ ] **Step 3: Link from the in-app About popover**

In `components/about-popover.tsx`, add a list item under the existing links pointing to `/docs/MCP.md` (rendered as a link to the GitHub copy via the existing `REPO_URL` helper). Reuse `lib/repo.ts` so the URL is centralized.

- [ ] **Step 4: Commit**

```bash
git add docs/MCP.md README.md components/about-popover.tsx
git commit -m "docs(mcp): document Streamable-HTTP endpoint and connectors"
```

---

## Section 6 — Server-Rendered `/about` Page

**Goal:** A stable, indexable `/about` URL that renders the public KB as static HTML on the server, with proper `<title>`, `<meta description>`, Open Graph tags, and a print stylesheet. Recruiters and search engines see Alexandre's CV without executing JS.

**Architecture:** A new App Router route `app/about/page.tsx` that is a server component. It calls `loadKb` + `assemblePublicKbText` on the server, runs the result through `react-markdown` (or a small custom renderer), and emits semantic HTML. Metadata is generated via `export const metadata`. A `app/about/print.css` is loaded only on this route.

**Files:**
- Create: `app/about/page.tsx`, `app/about/print.css`
- Create: `app/sitemap.ts`
- Create: `tests/app/about/page.test.tsx`

### Task 6.1: /about server component

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/about/page.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import About from "@/app/about/page";

describe("/about page", () => {
  it("renders profile name and at least one experience heading server-side", async () => {
    // Server components are async — invoke and render.
    const ui = await About();
    const { container } = render(ui);
    expect(container.textContent).toContain("Alexandre Collet");
    expect(container.querySelector("h2")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/about/page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

```tsx
// app/about/page.tsx
import type { Metadata } from "next";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import "./print.css";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Alexandre Collet — CV",
  description:
    "Battery systems and software engineer. Co-founder, CTO, builder — from silicon to cloud.",
  openGraph: {
    title: "Alexandre Collet — CV",
    description: "Battery systems and software engineer.",
    type: "profile",
  },
};

export default async function About() {
  const kb = await loadKb(path.join(process.cwd(), "kb"));
  const text = assemblePublicKbText(kb);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <article className="prose prose-neutral dark:prose-invert">
        <h1>{kb.profile.name}</h1>
        <p className="text-lg text-[var(--color-text-secondary)]">{kb.profile.headline}</p>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </article>
    </main>
  );
}
```

- [ ] **Step 4: Add print stylesheet**

```css
/* app/about/print.css */
@media print {
  body { background: #fff !important; color: #000 !important; }
  a { color: #000 !important; text-decoration: none !important; }
  nav, footer, .no-print { display: none !important; }
  article { max-width: none !important; }
}
```

- [ ] **Step 5: Run test to verify**

Run: `pnpm vitest run tests/app/about/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add sitemap**

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/about`, changeFrequency: "weekly", priority: 0.9 },
  ];
}
```

- [ ] **Step 7: Commit**

```bash
git add app/about/ app/sitemap.ts tests/app/about/
git commit -m "feat(about): server-rendered /about page with metadata + sitemap"
```

---

## Section 7 — Admin Analytics

**Goal:** Three numbers and three lists, visible from the admin dashboard: (a) conversations per day for the last 30 days; (b) top forwarded-question topics; (c) per-conversation citation density. Computed on-demand from existing tables — no new aggregates table.

**Architecture:** A new `lib/admin/analytics.ts` exports pure functions that take a `db` handle and return shaped data. A new Analytics tab in the admin dashboard renders that data with simple SVG sparklines + a topic list. Question topics are derived by a tiny keyword classifier in JS — good enough for the volume; can be upgraded later.

**Files:**
- Create: `lib/admin/analytics.ts`
- Create: `tests/lib/admin/analytics.test.ts`
- Create: `app/api/admin/analytics/route.ts`
- Modify: `components/admin/admin-dashboard.tsx` (new tab)

### Task 7.1: Pure analytics functions

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin/analytics.test.ts
import { describe, it, expect } from "vitest";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

describe("conversationsPerDay", () => {
  it("buckets timestamps into UTC date keys", () => {
    const rows = [
      { startedAt: new Date("2026-05-20T10:00:00Z") },
      { startedAt: new Date("2026-05-20T22:30:00Z") },
      { startedAt: new Date("2026-05-21T01:00:00Z") },
    ];
    expect(conversationsPerDay(rows, 3, new Date("2026-05-22T00:00:00Z"))).toEqual([
      { date: "2026-05-20", count: 2 },
      { date: "2026-05-21", count: 1 },
      { date: "2026-05-22", count: 0 },
    ]);
  });
});

describe("topQuestionTopics", () => {
  it("buckets questions by keyword and returns counts descending", () => {
    const rows = [
      { question: "What is his battery management experience?" },
      { question: "Tell me about his battery skills" },
      { question: "How do I contact him?" },
      { question: "What's his most recent role?" },
    ];
    const out = topQuestionTopics(rows);
    expect(out[0]).toEqual({ topic: "battery", count: 2 });
    expect(out.map((t) => t.topic)).toContain("contact");
    expect(out.map((t) => t.topic)).toContain("role");
  });
});

describe("citationDensityPerConversation", () => {
  it("counts citation tokens per assistant turn averaged across the conversation", () => {
    const conv = {
      id: "c1",
      transcript: [
        { role: "user", text: "q1", at: "" },
        { role: "assistant", text: "a [^kb:profile.yaml]", at: "" },
        { role: "user", text: "q2", at: "" },
        { role: "assistant", text: "b [^kb:profile.yaml] and [^kb:skills.yaml]", at: "" },
      ],
    };
    const r = citationDensityPerConversation(conv);
    // 1 + 2 citations across 2 assistant turns -> 1.5 average
    expect(r).toEqual({ conversationId: "c1", assistantTurns: 2, avgCitations: 1.5 });
  });

  it("returns avgCitations 0 when there are no assistant turns", () => {
    const r = citationDensityPerConversation({ id: "c1", transcript: [] });
    expect(r).toEqual({ conversationId: "c1", assistantTurns: 0, avgCitations: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/admin/analytics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the functions**

```ts
// lib/admin/analytics.ts
import { parseCitations } from "@/lib/kb/citations";

export type DayCount = { date: string; count: number };

export function conversationsPerDay(
  rows: { startedAt: Date }[],
  days: number,
  now: Date,
): DayCount[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = new Date(r.startedAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

const TOPIC_KEYWORDS: { topic: string; words: string[] }[] = [
  { topic: "battery", words: ["battery", "bms", "soc", "soh", "balancing"] },
  { topic: "contact", words: ["contact", "email", "reach", "linkedin"] },
  { topic: "role", words: ["role", "recent", "current", "title", "position"] },
  { topic: "ai", words: ["ai", "llm", "agent", "anthropic", "claude"] },
  { topic: "leadership", words: ["cto", "founder", "team", "manage", "hire"] },
];

export function topQuestionTopics(
  rows: { question: string }[],
): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const lower = r.question.toLowerCase();
    for (const t of TOPIC_KEYWORDS) {
      if (t.words.some((w) => lower.includes(w))) {
        counts.set(t.topic, (counts.get(t.topic) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

export type CitationDensity = {
  conversationId: string;
  assistantTurns: number;
  avgCitations: number;
};

export function citationDensityPerConversation(conv: {
  id: string;
  transcript: { role: string; text: string; at: string }[];
}): CitationDensity {
  const assistant = conv.transcript.filter((t) => t.role === "assistant");
  if (assistant.length === 0) {
    return { conversationId: conv.id, assistantTurns: 0, avgCitations: 0 };
  }
  const total = assistant.reduce((acc, t) => acc + parseCitations(t.text).length, 0);
  return {
    conversationId: conv.id,
    assistantTurns: assistant.length,
    avgCitations: total / assistant.length,
  };
}
```

- [ ] **Step 4: Run test to verify**

Run: `pnpm vitest run tests/lib/admin/analytics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/analytics.ts tests/lib/admin/analytics.test.ts
git commit -m "feat(admin): analytics — per-day, topics, citation density"
```

### Task 7.2: Analytics API + tab

- [ ] **Step 1: API route**

```ts
// app/api/admin/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { conversations, questionsForAlex } from "@/lib/db/schema";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const convs = await db.select().from(conversations);
  const qs = await db.select().from(questionsForAlex);
  return NextResponse.json({
    perDay: conversationsPerDay(convs, 30, new Date()),
    topics: topQuestionTopics(qs),
    density: convs.map((c) =>
      citationDensityPerConversation({ id: c.id, transcript: c.transcript ?? [] }),
    ),
  });
}
```

- [ ] **Step 2: Add an "Analytics" tab to admin-dashboard.tsx**

Add `"analytics"` to the `TabId` union and the `tabs` array (label `"Analytics"`, count = 0 or omitted). Add an `AnalyticsPanel` component to the same file and render it from the tabpanel:

```tsx
type AnalyticsData = {
  perDay: { date: string; count: number }[];
  topics: { topic: string; count: number }[];
  density: { conversationId: string; assistantTurns: number; avgCitations: number }[];
};

function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!data) return <p className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">Loading…</p>;

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
              <rect
                key={d.date}
                x={x - 3}
                y={60 - h}
                width={6}
                height={h}
                fill="var(--color-accent)"
                opacity={0.85}
              />
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
              <span className="w-24 font-mono text-[10px] uppercase text-[var(--color-text-secondary)]">{t.topic}</span>
              <div className="h-2 flex-1 rounded bg-[var(--color-border)]">
                <div
                  className="h-2 rounded bg-[var(--color-primary)]"
                  style={{ width: `${(t.count / maxTopic) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[10px] text-[var(--color-text-tertiary)]">{t.count}</span>
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
                <td className="py-1.5 pr-3 font-mono text-[10px] text-[var(--color-text-secondary)]">{d.conversationId.slice(0, 8)}</td>
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

Then, in the existing tabpanel section, add:

```tsx
{tab === "analytics" && <AnalyticsPanel />}
```

The `selected` state map already gets a `null` slot via the union update; the detail sidebar can stay closed on this tab (no `selectedId` flow needed).

- [ ] **Step 3: Run typecheck + suite**

Run: `pnpm typecheck && pnpm vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/analytics/ components/admin/admin-dashboard.tsx
git commit -m "feat(admin): analytics tab — per-day, topics, citation density"
```

---

## Section 8 — Deployability: Docker + Self-Host Path

**Goal:** A new contributor can clone the repo, run `docker compose up`, point a browser at `localhost:3000`, and have a working queryme with Postgres + Redis + Next.js. The Anthropic key is the only required external dependency.

**Architecture:** Add a `docker-compose.yml` with three services (postgres, redis, next). The Next image is a multi-stage Dockerfile based on the official `node:22-alpine`. Document the env-var contract in `.env.example`. KV already supports MemoryKv as a fallback (skip for prod) and Upstash, so the only KV addition is to detect a generic `REDIS_URL` and use the `redis` npm package as a third driver — kept thin behind the existing `KvClient` interface.

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`
- Modify: `lib/kv/client.ts` (RedisKv driver behind `REDIS_URL`)
- Modify: `tests/lib/kv/rate-limit.test.ts` (no change needed; uses MemoryKv)
- Modify: `README.md`

### Task 8.1: Generic Redis KV driver

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/kv/redis-driver.test.ts
import { describe, it, expect } from "vitest";
import { RedisKv } from "@/lib/kv/client";

class FakeRedis {
  store = new Map<string, string>();
  ttl = new Map<string, number>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async set(k: string, v: string, ...args: unknown[]) {
    let ex: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "EX") ex = args[++i] as number;
      else if (args[i] === "NX") nx = true;
    }
    if (nx && this.store.has(k)) return null;
    this.store.set(k, v);
    if (ex) this.ttl.set(k, Date.now() + ex * 1000);
    return "OK";
  }
  async incr(k: string) {
    const n = parseInt(this.store.get(k) ?? "0", 10) + 1;
    this.store.set(k, String(n));
    return n;
  }
  async expire(k: string, s: number) {
    if (!this.store.has(k)) return 0;
    this.ttl.set(k, Date.now() + s * 1000);
    return 1;
  }
  async del(k: string) { return this.store.delete(k) ? 1 : 0; }
}

describe("RedisKv", () => {
  it("implements the KvClient contract over node-redis-shaped client", async () => {
    const r = new FakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = new RedisKv(r as any);
    expect(await kv.set("k", "v", { ex: 60 })).toBe("OK");
    expect(await kv.get("k")).toBe("v");
    expect(await kv.incr("n")).toBe(1);
    expect(await kv.incr("n")).toBe(2);
    expect(await kv.del("k")).toBe(1);
    expect(await kv.set("nx", "1", { nx: true })).toBe("OK");
    expect(await kv.set("nx", "2", { nx: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/kv/redis-driver.test.ts`
Expected: FAIL — `RedisKv` not exported.

- [ ] **Step 3: Implement RedisKv and wire it into getKv**

Edit `lib/kv/client.ts`:

```ts
import { createClient, type RedisClientType } from "redis";

// ...existing UpstashKv, MemoryKv...

export class RedisKv implements KvClient {
  constructor(private redis: { get: (k: string) => Promise<string | null>; set: (...a: any[]) => Promise<string | null>; incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<number>; del: (k: string) => Promise<number> }) {}
  async get(key: string) { return await this.redis.get(key); }
  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
    const args: unknown[] = [];
    if (opts?.ex) args.push("EX", opts.ex);
    if (opts?.nx) args.push("NX");
    const r = await this.redis.set(key, value, ...args);
    return r === "OK" ? "OK" : null;
  }
  async incr(key: string) { return await this.redis.incr(key); }
  async expire(key: string, seconds: number) { return await this.redis.expire(key, seconds); }
  async del(key: string) { return await this.redis.del(key); }
}

let cached: KvClient | null = null;
export function getKv(): KvClient {
  if (cached) return cached;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const client: RedisClientType = createClient({ url: redisUrl });
    client.connect().catch(() => undefined); // best-effort; queue commands until ready
    cached = new RedisKv(client as unknown as ConstructorParameters<typeof RedisKv>[0]);
    return cached;
  }
  // existing Upstash branch follows
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Set REDIS_URL, or KV_REST_API_URL / KV_REST_API_TOKEN. Configure in .env.local or container env.",
    );
  }
  cached = new UpstashKv(new Redis({ url, token, automaticDeserialization: false }));
  return cached;
}
```

Add `redis` to dependencies: `pnpm add redis`.

- [ ] **Step 4: Run test to verify**

Run: `pnpm vitest run tests/lib/kv/redis-driver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kv/client.ts tests/lib/kv/redis-driver.test.ts package.json pnpm-lock.yaml
git commit -m "feat(kv): add generic RedisKv driver behind REDIS_URL"
```

### Task 8.2: Dockerfile + compose

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# Dockerfile
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/kb ./kb
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.git
.env
.env.local
graphify-out
docs
tests
*.md
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: queryme
      POSTGRES_PASSWORD: queryme
      POSTGRES_DB: queryme
    volumes: ["pg:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U queryme"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  web:
    build: .
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://queryme:queryme@postgres:5432/queryme
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      FORWARD_NOTIFICATION_TO: ${FORWARD_NOTIFICATION_TO:-}
      FORWARD_NOTIFICATION_FROM: ${FORWARD_NOTIFICATION_FROM:-queryme@localhost}
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-admin}
      SESSION_SECRET: ${SESSION_SECRET:-please-change}
    ports: ["3000:3000"]

volumes:
  pg:
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Required
ANTHROPIC_API_KEY=

# Required for self-host
DATABASE_URL=postgres://queryme:queryme@localhost:5432/queryme
REDIS_URL=redis://localhost:6379

# Optional (forward-question notifications + admin reply emails)
RESEND_API_KEY=
FORWARD_NOTIFICATION_TO=
FORWARD_NOTIFICATION_FROM=queryme@localhost

# Admin
ADMIN_PASSWORD=admin
SESSION_SECRET=please-change-me
```

- [ ] **Step 5: Smoke-test the build (local)**

If Docker is available locally, run: `docker compose build web`
Expected: builds successfully. Skip if Docker is not available — the CI will exercise it.

- [ ] **Step 6: Document in README.md**

Append:

```markdown
## Self-host with Docker

    cp .env.example .env
    # set ANTHROPIC_API_KEY at minimum
    docker compose up --build

Then open http://localhost:3000. The first boot runs migrations automatically
inside the web container.
```

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml .env.example README.md
git commit -m "feat(deploy): Docker + compose for full self-host"
```

---

## Section 9 — KB i18n Parity (French)

**Goal:** A French recruiter gets French KB content. Section-level i18n: each KB entry may have a `<slug>.fr.md` sidecar with translated body and frontmatter. The loader picks the right variant based on the requested language; YAML-only files (profile/skills/education/public-contact) get optional `*.fr.yaml` sidecars.

**Architecture:** Loader signature changes from `loadKb(dir)` to `loadKb(dir, lang)`. Internally, for each file it tries `<base>.<lang>.<ext>` first and falls back to `<base>.<ext>`. The assembler and the `/api/chat` route are wired to read `language` from the conversation row.

**Files:**
- Modify: `lib/kb/loader.ts`, `tests/lib/kb/loader.test.ts`
- Modify: `lib/kb/cache.ts` (cache key includes lang)
- Modify: `app/api/chat/route.ts` (pass lang through)
- Modify: `app/api/kb/file/route.ts` (serve the right variant)
- Create: 1 example `.fr.md` for one experience entry to exercise the path
- Create: `tests/fixtures/kb/experience/2024-fixture-co.fr.md`

### Task 9.1: Language-aware loader

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/kb/loader.test.ts`:

```ts
import { loadKb } from "@/lib/kb/loader";

it("prefers a *.fr.md sidecar when lang=fr is requested", async () => {
  const kb = await loadKb(FIXTURE_DIR, "fr");
  const fixture = kb.experience.find((e) => e.slug === "2024-fixture-co");
  expect(fixture).toBeDefined();
  expect(fixture!.body).toContain("Corps de fixture.");
});

it("falls back to the base file when no fr sidecar exists", async () => {
  const kb = await loadKb(FIXTURE_DIR, "fr");
  const older = kb.experience.find((e) => e.slug === "2020-older-co");
  expect(older).toBeDefined();
  // No fr sidecar — should still be the English original.
  expect(older!.body).toBeTruthy();
});
```

Create `tests/fixtures/kb/experience/2024-fixture-co.fr.md`:

```markdown
---
company: Fixture Co
role: Engineer
start: "2024-01"
end: present
---

Corps de fixture.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/kb/loader.test.ts`
Expected: FAIL — `loadKb` only takes one arg.

- [ ] **Step 3: Extend the loader**

Edit `lib/kb/loader.ts`. Change `loadKb`:

```ts
export type KbLang = "en" | "fr";

async function pickFile(base: string, ext: string, lang: KbLang): Promise<string> {
  if (lang !== "en") {
    const localized = `${base}.${lang}.${ext}`;
    try {
      await fs.access(localized);
      return localized;
    } catch { /* fallthrough to base */ }
  }
  return `${base}.${ext}`;
}

async function readMarkdownDir<F>(
  dir: string,
  schema: { parse: (v: unknown) => F },
  label: string,
  lang: KbLang,
): Promise<Array<{ slug: string; relativePath: string; frontmatter: F; body: string }>> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  // Only consider canonical files (no `.<lang>.md` siblings here — we resolve via pickFile).
  const md = files.filter((f) => f.endsWith(".md") && !/\.[a-z]{2}\.md$/.test(f)).sort();
  const out = [];
  for (const file of md) {
    const base = path.join(dir, file.replace(/\.md$/, ""));
    const actual = await pickFile(base, "md", lang);
    const raw = await fs.readFile(actual, "utf8");
    const parsed = matter(raw);
    const frontmatter = schema.parse(parsed.data);
    out.push({
      slug: file.replace(/\.md$/, ""),
      relativePath: `${path.basename(dir)}/${file}`,
      frontmatter,
      body: parsed.content.trim(),
    });
  }
  return out;
}

export async function loadKb(rootDir: string, lang: KbLang = "en"): Promise<Kb> {
  // ... same as before, but every readYamlFile / readMarkdownDir takes `lang`
  const [profile, skills, education, publicContact, experience, projects, talks, openSource, recommendations] = await Promise.all([
    readYamlFile(await pickFile(path.join(rootDir, "profile"), "yaml", lang), ProfileSchema, "profile.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "skills"), "yaml", lang), SkillsSchema, "skills.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "education"), "yaml", lang), EducationSchema, "education.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "public-contact"), "yaml", lang), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience", lang),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects", lang),
    readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks", lang),
    readMarkdownDir(path.join(rootDir, "open-source"), OpenSourceFrontmatterSchema, "open-source", lang),
    readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations", lang),
  ]);
  // ...same sort + return as before...
}
```

`readYamlFile`'s signature must also accept the already-resolved path (no behavioural change beyond taking the full path the caller resolved). Verify by reading the existing implementation: it already takes a full `file` path, so no change to that function — only the call sites pass `pickFile`'s output.

- [ ] **Step 4: Run loader tests to verify**

Run: `pnpm vitest run tests/lib/kb/loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Bust the cache by language**

Edit `lib/kb/cache.ts`: include `lang` in the cache key. Without seeing the file, the change is: rename the existing top-level cache to a `Map<KbLang, CachedValue>`, or include `lang` in a tuple key. Add a quick test that two consecutive calls with different `lang` return different KBs.

- [ ] **Step 6: Pass `lang` from the chat route**

In `app/api/chat/route.ts`, read `language` from the conversation (or default to `en` for new conversations) and pass it to `getCachedPublicKbText({ lang })`. Update the cache helper signature accordingly.

- [ ] **Step 7: Pass `lang` to the KB-file route**

In `app/api/kb/file/route.ts`, accept an optional `?lang=fr` query param and serve the localized sidecar when present.

- [ ] **Step 8: Run typecheck + full suite**

Run: `pnpm typecheck && pnpm vitest run`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/kb/ app/api/chat/route.ts app/api/kb/file/route.ts tests/lib/kb/ tests/fixtures/kb/experience/2024-fixture-co.fr.md
git commit -m "feat(kb): language-aware loader with .fr sidecars + cache by lang"
```

---

## Post-roadmap verification

After all nine sections are merged:

- [ ] **Step 1: Full suite**

Run: `pnpm vitest run`
Expected: every test green, count significantly higher than baseline.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Refresh the knowledge graph**

Run: `/graphify --update`
Expected: new nodes for `lib/notify/email.ts`, `evals/*`, `app/about/page.tsx`, `app/api/admin/questions/[id]/reply/route.ts`, `lib/admin/analytics.ts`, `RedisKv`. Inspect the new GRAPH_REPORT.md for any new INFERRED policy contracts that warrant lockdown tests (apply the same pattern as `tests/prompts/system-contract.test.ts`).

- [ ] **Step 4: Smoke-test self-host**

Run: `docker compose up --build` and verify `/`, `/about`, `/admin`, and `/api/mcp` all respond.

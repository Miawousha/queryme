# Interviewer Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the queryme agent a tool to recognize who it is talking to (recruiters/interviewers), store that identity per conversation, and surface it in the `/admin` dashboard and the chat UI.

**Architecture:** A real AI-SDK `tool()` (`identify_interviewer`) is passed into the shared `answer()` call. When a visitor reveals who they are, the agent calls the tool; its `execute` persists the identity into a new nullable `interviewer` jsonb column on `conversations`. Both the web chat and MCP `ask` paths wire the tool in, so identification works on both channels. The web chat shows a live identity chip; `/admin` shows a dedicated Interviewers section plus per-conversation summaries.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle ORM on Neon Postgres, Vercel AI SDK (`ai@5`), Zod v4, vitest.

---

## File Structure

**Created:**
- `lib/interviewer/repo.ts` — `setInterviewer` DB write (mirrors `lib/conversations/repo.ts`'s `appendTurn`).
- `lib/interviewer/tool.ts` — `buildIdentifyTools`, the AI-SDK tool factory.
- `tests/lib/interviewer/tool.test.ts` — unit tests for the tool's `execute`.
- `tests/lib/admin/data.test.ts` — unit tests for `buildAdminData`.

**Modified:**
- `lib/db/schema.ts` — `InterviewerIdentity` type + `interviewer` column.
- `lib/db/migrations/` — generated migration (new `00NN_*.sql` file).
- `lib/answerer.ts` — optional `tools` param + multi-step.
- `app/api/chat/route.ts` — wire the tool into the chat path.
- `lib/mcp/tools.ts` — add `conversationId` to `ProduceAnswerArgs`, pass it through.
- `lib/mcp/server.ts` — wire the tool into the MCP `ask` path.
- `tests/lib/answerer.test.ts` — test for `tools` forwarding.
- `tests/lib/mcp/tools.test.ts` — test for `conversationId` passthrough.
- `lib/admin/data.ts` — extract pure `buildAdminData`; add `identified` stat + `interviewers` list.
- `components/admin/admin-dashboard.tsx` — Interviewers section, row summary, stat tile.
- `components/chat.tsx` — live identity chip.
- `lib/language.ts` — `identity` UI strings (en + fr).
- `prompts/system.md` — `identify_interviewer` instructions + disclosure.
- `README.md` — transparency note.

---

## Task 1: Schema + migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create (generated): `lib/db/migrations/00NN_*.sql`

- [ ] **Step 1: Add the `InterviewerIdentity` type and `interviewer` column**

In `lib/db/schema.ts`, add the type after the `ConversationTurn` type, and add the column to the `conversations` table.

Add to the `conversations` table definition, after the `transcript` line:

```ts
  interviewer: jsonb("interviewer").$type<InterviewerIdentity>(),
```

Add this type next to `ConversationTurn`:

```ts
/**
 * What the agent has learned about the visitor it is talking to. Stored as a
 * single jsonb sub-record of its conversation, overwritten in place each time
 * the agent calls the `identify_interviewer` tool. All identity fields are
 * optional — the agent fills whatever it has.
 */
export type InterviewerIdentity = {
  name?: string;
  company?: string;
  role?: string; // the visitor's own title, e.g. "VP Engineering"
  hiringFor?: string; // the role/context they are recruiting for
  contact?: string; // email / LinkedIn, if shared
  notes?: string; // free-text context that doesn't fit a field
  basis: "stated" | "inferred";
  updatedAt: string; // ISO timestamp, set server-side
};
```

`jsonb` is already imported on line 1.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit reports a new migration file under `lib/db/migrations/` adding the `interviewer` column.

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): add interviewer identity column to conversations"
```

---

## Task 2: Interviewer module — repo + tool

**Files:**
- Create: `lib/interviewer/repo.ts`
- Create: `lib/interviewer/tool.ts`
- Test: `tests/lib/interviewer/tool.test.ts`

- [ ] **Step 1: Write the repo**

Create `lib/interviewer/repo.ts`. This mirrors `appendTurn` in `lib/conversations/repo.ts` — including the "error if no rows matched" guard.

```ts
import { eq } from "drizzle-orm";
import { conversations, type InterviewerIdentity } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

/**
 * Overwrite the interviewer identity for a conversation. The agent re-states
 * the complete identity it knows on each `identify_interviewer` call, so this
 * is a plain overwrite — no merge logic.
 */
export async function setInterviewer(
  db: Db,
  conversationId: string,
  identity: InterviewerIdentity,
): Promise<void> {
  const updated = await db
    .update(conversations)
    .set({ interviewer: identity })
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });

  // An UPDATE that matched no rows silently drops the identity — surface it.
  if (updated.length === 0) {
    throw new Error(
      `setInterviewer: conversation ${conversationId} does not exist; identity was not persisted`,
    );
  }
}
```

- [ ] **Step 2: Write the failing test for the tool**

Create `tests/lib/interviewer/tool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
import type { InterviewerIdentity } from "@/lib/db/schema";

const execOpts = { toolCallId: "t1", messages: [] } as never;

describe("identify_interviewer tool", () => {
  it("persists the identity with a server-stamped updatedAt", async () => {
    const saved: InterviewerIdentity[] = [];
    const tools = buildIdentifyTools(async (id) => {
      saved.push(id);
    });
    const before = Date.now();

    const result = await tools.identify_interviewer.execute!(
      { name: "Sarah", company: "Acme", hiringFor: "a CTO", basis: "stated" },
      execOpts,
    );

    expect(result).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Sarah");
    expect(saved[0].company).toBe("Acme");
    expect(saved[0].basis).toBe("stated");
    expect(new Date(saved[0].updatedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns ok:false when persistence throws, without throwing", async () => {
    const tools = buildIdentifyTools(async () => {
      throw new Error("db down");
    });

    const result = await tools.identify_interviewer.execute!(
      { basis: "inferred" },
      execOpts,
    );

    expect(result).toEqual({ ok: false, error: "db down" });
  });

  it("rejects input with a missing basis field", async () => {
    const tools = buildIdentifyTools(async () => {});
    await expect(
      tools.identify_interviewer.execute!({ name: "Sarah" } as never, execOpts),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/lib/interviewer/tool.test.ts`
Expected: FAIL — `buildIdentifyTools` is not defined / module not found.

- [ ] **Step 4: Write the tool**

Create `lib/interviewer/tool.ts`:

```ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { InterviewerIdentity } from "@/lib/db/schema";

/** Input the agent supplies — identity fields minus the server-stamped time. */
const IdentifyInputSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  hiringFor: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  basis: z.enum(["stated", "inferred"]),
});

/**
 * Build the `identify_interviewer` tool set, bound to a `persist` closure that
 * writes the identity for one specific conversation. Returned as a `ToolSet`
 * record so callers can spread it straight into `answer({ tools })`.
 *
 * `execute` never throws: a persistence failure is best-effort and must not
 * abort the answer stream — it is reported back to the model as `ok: false`.
 */
export function buildIdentifyTools(
  persist: (identity: InterviewerIdentity) => Promise<void>,
): ToolSet {
  return {
    identify_interviewer: tool({
      description:
        "Record who you are talking to. Call this when the visitor reveals " +
        "their identity (name, company, their role, what they are hiring " +
        "for, contact details). Pass the COMPLETE picture you have so far " +
        "every time — this overwrites the previous record. Set `basis` to " +
        "`stated` when the visitor said it explicitly, `inferred` when you " +
        "deduced it from context.",
      inputSchema: IdentifyInputSchema,
      execute: async (input) => {
        const identity: InterviewerIdentity = {
          ...input,
          updatedAt: new Date().toISOString(),
        };
        try {
          await persist(identity);
          return { ok: true as const };
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/lib/interviewer/tool.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/interviewer tests/lib/interviewer
git commit -m "feat(interviewer): identity repo and identify_interviewer tool"
```

---

## Task 3: Tool support in `answer()`

**Files:**
- Modify: `lib/answerer.ts`
- Test: `tests/lib/answerer.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("answer", ...)` block in `tests/lib/answerer.test.ts`:

```ts
  it("forwards tools to the model when provided", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    const { tool } = await import("ai");
    const { z } = await import("zod");
    const tools = {
      my_tool: tool({
        description: "d",
        inputSchema: z.object({ x: z.string() }),
        execute: async () => ({ ok: true }),
      }),
    };

    await answer({
      messages: [{ role: "user", content: "Hi" }],
      kbText: "KB",
      model,
      tools,
    }).then((r) => r.text);

    expect(captured.tools).toBeDefined();
    expect(captured.tools.length).toBe(1);
  });

  it("sends no tools when none are provided", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({ messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);

    expect(captured.tools === undefined || captured.tools.length === 0).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/lib/answerer.test.ts`
Expected: FAIL on "forwards tools" — `captured.tools` is `undefined` (the `tools` param is not passed through yet).

- [ ] **Step 3: Implement tool support in `answer()`**

In `lib/answerer.ts`:

Change the import on line 1 to add `stepCountIs` and `ToolSet`:

```ts
import { streamText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
```

Add `tools` to `AnswerInput`:

```ts
export type AnswerInput = {
  messages: ModelMessage[];
  kbText: string;
  model?: LanguageModel;
  /**
   * Optional tools the agent may call mid-answer. When present, `streamText`
   * runs multi-step (tool call → tool result → final answer); when absent,
   * behaviour is unchanged.
   */
  tools?: ToolSet;
};
```

Change the `return streamText({...})` block to:

```ts
  return streamText({
    model,
    messages: [...systemMessages, ...input.messages],
    temperature: 0.3,
    ...(input.tools
      ? { tools: input.tools, stopWhen: stepCountIs(5) }
      : {}),
  });
```

`stopWhen: stepCountIs(5)` lets the model produce a final text answer after a tool call — without it `streamText` would stop at the tool result.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/lib/answerer.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/answerer.ts tests/lib/answerer.test.ts
git commit -m "feat(answerer): optional tools with multi-step streaming"
```

---

## Task 4: Wire the tool into the chat path

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Wire `buildIdentifyTools` into the `answer()` call**

In `app/api/chat/route.ts`, add imports near the other `lib` imports:

```ts
import { setInterviewer } from "@/lib/interviewer/repo";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
```

Change the `answer(...)` call (currently lines 91-94) to pass `tools`:

```ts
  const result = await answer({
    messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
    kbText: publicKbText,
    tools: buildIdentifyTools((identity) => setInterviewer(db, conversationId, identity)),
  });
```

`getOrCreateConversation` already ran above (line 76), so the conversation row exists when the tool's `execute` fires.

- [ ] **Step 2: Verify types and existing route tests still pass**

Run: `pnpm typecheck && pnpm test tests/app/api/chat/route.test.ts`
Expected: PASS — the route validation tests are unaffected (they stop before `answer()`).

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): enable interviewer identification on the chat path"
```

---

## Task 5: Wire the tool into the MCP `ask` path

**Files:**
- Modify: `lib/mcp/tools.ts`
- Modify: `lib/mcp/server.ts`
- Test: `tests/lib/mcp/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside `describe("handleAsk", ...)` in `tests/lib/mcp/tools.test.ts`:

```ts
  it("passes the conversationId to produceAnswer", async () => {
    const store = makeConversationStore();
    const convId = "33333333-3333-4333-8333-333333333333";
    let seenConversationId: string | undefined;
    const deps: AskDeps = {
      db: {} as never,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      loadPublicKbText: async () => "PUBLIC KB",
      produceAnswer: async ({ conversationId }) => {
        seenConversationId = conversationId;
        return "answer";
      },
    };

    await handleAsk(deps, { question: "who built this?", conversationId: convId });

    expect(seenConversationId).toBe(convId);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/lib/mcp/tools.test.ts`
Expected: FAIL — `conversationId` is not a property of the `produceAnswer` argument (TypeScript error or `undefined` at runtime).

- [ ] **Step 3: Add `conversationId` to `ProduceAnswerArgs` and pass it through**

In `lib/mcp/tools.ts`, change `ProduceAnswerArgs`:

```ts
export type ProduceAnswerArgs = {
  messages: ModelMessage[];
  kbText: string;
  conversationId: string;
};
```

Change the `produceAnswer` call inside `handleAsk` (currently `const answerText = await deps.produceAnswer({ messages, kbText });`) to:

```ts
  const answerText = await deps.produceAnswer({ messages, kbText, conversationId });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/mcp/tools.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Wire the tool into `server.ts`**

In `lib/mcp/server.ts`, add imports near the other `lib` imports:

```ts
import { setInterviewer } from "@/lib/interviewer/repo";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
```

Change the `produceAnswer` closure inside the `ask` tool registration (currently lines 59-62) to:

```ts
            produceAnswer: async ({ messages, kbText, conversationId }) => {
              const streamed = await answer({
                messages,
                kbText,
                tools: buildIdentifyTools((identity) =>
                  setInterviewer(getDb(), conversationId, identity),
                ),
              });
              return await streamed.text;
            },
```

`getDb()` is already imported in `server.ts`. The conversation row is created by `getOrCreateConversation` earlier in `handleAsk`, so it exists when the tool fires. `streamed.text` resolves to the final aggregated text across all steps.

- [ ] **Step 6: Verify everything compiles and tests pass**

Run: `pnpm typecheck && pnpm test tests/lib/mcp`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/mcp/tools.ts lib/mcp/server.ts tests/lib/mcp/tools.test.ts
git commit -m "feat(mcp): enable interviewer identification on the ask path"
```

---

## Task 6: System prompt + README disclosure

**Files:**
- Modify: `prompts/system.md`
- Modify: `README.md`

- [ ] **Step 1: Add the tool instructions to the system prompt**

In `prompts/system.md`, add a new section immediately **before** the `## Citations` section:

```markdown
## Identifying who you're talking to

You have a tool, `identify_interviewer`, for recording who you are speaking
with. Visitors are typically recruiters and hiring managers, and Alexandre
wants to know who reached out.

- Call `identify_interviewer` whenever the visitor reveals something about
  their identity — their name, their company, their own role, the role they
  are hiring for, or contact details (e.g. "Hi, I'm Sarah from Acme, we're
  hiring a CTO").
- Pass the **complete** picture you have so far on every call. Each call
  overwrites the previous record.
- Set `basis` to `stated` when the visitor said it explicitly, or `inferred`
  when you deduced it from context.
- This is not secret. If a visitor asks, tell them plainly that you note who
  you are speaking with so Alexandre knows who was interested — and that, like
  everything else here, the code that does it is in the public repo.
- Do not interrogate the visitor. Only record what they volunteer naturally.
```

- [ ] **Step 2: Add a transparency note to the README**

In `README.md`, find the "How it works" section. After its numbered list, add a new paragraph:

```markdown
The agent can also recognize who it is talking to: when a visitor introduces
themselves (e.g. a recruiter naming their company and the role they're
hiring for), the agent calls an `identify_interviewer` tool that records that
on the conversation. Nothing is hidden — the tool, its code, and the prompt
instructions are all in this repo, and the chat shows a chip with exactly what
was captured.
```

- [ ] **Step 3: Verify the build still passes**

Run: `pnpm build`
Expected: PASS — the system prompt is read at runtime; this confirms nothing broke.

- [ ] **Step 4: Commit**

```bash
git add prompts/system.md README.md
git commit -m "docs: disclose interviewer identification in prompt and README"
```

---

## Task 7: Admin data — `identified` stat + `interviewers` list

**Files:**
- Modify: `lib/admin/data.ts`
- Test: `tests/lib/admin/data.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin/data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAdminData } from "@/lib/admin/data";
import type { Conversation, QuestionForAlex } from "@/lib/db/schema";

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    ...overrides,
  };
}

describe("buildAdminData", () => {
  it("counts identified conversations and collects them into interviewers", () => {
    const convs: Conversation[] = [
      conv({ id: "a", channel: "chat" }),
      conv({
        id: "b",
        channel: "mcp",
        interviewer: { name: "Sarah", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
      }),
      conv({ id: "c", channel: "chat" }),
    ];
    const questions: QuestionForAlex[] = [];

    const data = buildAdminData(convs, questions);

    expect(data.stats.conversations).toBe(3);
    expect(data.stats.chat).toBe(2);
    expect(data.stats.mcp).toBe(1);
    expect(data.stats.identified).toBe(1);
    expect(data.interviewers.map((c) => c.id)).toEqual(["b"]);
  });

  it("reports zero identified when no conversation has an interviewer", () => {
    const data = buildAdminData([conv({ id: "a" })], []);
    expect(data.stats.identified).toBe(0);
    expect(data.interviewers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/lib/admin/data.test.ts`
Expected: FAIL — `buildAdminData` is not exported.

- [ ] **Step 3: Refactor `lib/admin/data.ts` to expose a pure `buildAdminData`**

Replace the contents of `lib/admin/data.ts` with:

```ts
/** Read model for the admin dashboard — one query pass over the two tables. */

import { desc } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import {
  conversations,
  questionsForAlex,
  type Conversation,
  type QuestionForAlex,
} from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** Most recent conversations shown on the dashboard. */
export const CONVERSATION_LIMIT = 200;

export type AdminStats = {
  conversations: number;
  chat: number;
  mcp: number;
  questions: number;
  unanswered: number;
  identified: number;
};

export type AdminData = {
  stats: AdminStats;
  conversations: Conversation[];
  questions: QuestionForAlex[];
  /** Conversations whose visitor the agent has identified. */
  interviewers: Conversation[];
};

/** Pure shaping of the two raw tables into the dashboard read model. */
export function buildAdminData(
  convs: Conversation[],
  questionRows: QuestionForAlex[],
): AdminData {
  const interviewers = convs.filter((c) => c.interviewer != null);
  return {
    stats: {
      conversations: convs.length,
      chat: convs.filter((c) => c.channel === "chat").length,
      mcp: convs.filter((c) => c.channel === "mcp").length,
      questions: questionRows.length,
      unanswered: questionRows.filter((q) => q.answeredAt === null).length,
      identified: interviewers.length,
    },
    conversations: convs,
    questions: questionRows,
    interviewers,
  };
}

export async function loadAdminData(db: Db): Promise<AdminData> {
  const [convs, questionRows] = await Promise.all([
    db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(CONVERSATION_LIMIT),
    db.select().from(questionsForAlex).orderBy(desc(questionsForAlex.createdAt)),
  ]);

  return buildAdminData(convs, questionRows);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/lib/admin/data.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/data.ts tests/lib/admin/data.test.ts
git commit -m "feat(admin): identified stat and interviewers list in read model"
```

---

## Task 8: Admin dashboard UI

**Files:**
- Modify: `components/admin/admin-dashboard.tsx`

- [ ] **Step 1: Add the `identified` stat tile**

In `components/admin/admin-dashboard.tsx`, change the stats `<section>` (currently `grid-cols-3` with three `<Stat>`) to a four-tile grid:

```tsx
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Conversations" value={stats.conversations} />
        <Stat label="Chat / MCP" value={`${stats.chat} / ${stats.mcp}`} />
        <Stat
          label="Questions"
          value={`${stats.questions}`}
          hint={stats.unanswered > 0 ? `${stats.unanswered} unanswered` : "all answered"}
        />
        <Stat label="Identified" value={stats.identified} />
      </section>
```

- [ ] **Step 2: Destructure `interviewers` and render the Interviewers section**

Change the destructure line near the top of `AdminDashboard` from
`const { stats, conversations, questions } = data;` to:

```tsx
  const { stats, conversations, questions, interviewers } = data;
```

Add this `<Section>` immediately **after** the stats `<section>` and **before** the Conversations `<Section>`:

```tsx
      <Section title="Interviewers" count={interviewers.length}>
        {interviewers.length === 0 ? (
          <Empty>No interviewers identified yet.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {interviewers.map((c) => (
              <InterviewerCard key={c.id} conversation={c} />
            ))}
          </div>
        )}
      </Section>
```

- [ ] **Step 3: Add the `InterviewerCard` component**

Add this component at the end of the file (after `QuestionRow`). It imports the `InterviewerIdentity` type — add `InterviewerIdentity` to the existing `import type` from `@/lib/db/schema` at the top of the file, so the line reads:

```tsx
import type { Conversation, QuestionForAlex, InterviewerIdentity } from "@/lib/db/schema";
```

```tsx
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

function InterviewerCard({ conversation }: { conversation: Conversation }) {
  // Non-null on every row of the interviewers list (filtered in buildAdminData).
  const id = conversation.interviewer as InterviewerIdentity;
  return (
    <a
      href={`#conv-${conversation.id}`}
      className={`${CARD} flex flex-col gap-3 px-4 py-3 transition-colors hover:border-[var(--color-primary)]`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm text-[var(--color-text-primary)]">
          {id.name ?? "Unknown name"}
        </span>
        <Badge>{id.basis}</Badge>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {fmt(id.updatedAt)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {id.company && <Field label="Company" value={id.company} />}
        {id.role && <Field label="Role" value={id.role} />}
        {id.hiringFor && <Field label="Hiring for" value={id.hiringFor} />}
        {id.contact && <Field label="Contact" value={id.contact} />}
      </div>
      {id.notes && (
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {id.notes}
        </p>
      )}
    </a>
  );
}
```

- [ ] **Step 4: Add an anchor id and identity badge to `ConversationRow`**

In `ConversationRow`, change the opening `<details>` tag to carry an anchor id (so the Interviewers cards can link to it):

```tsx
  return (
    <details id={`conv-${conversation.id}`} className={`${CARD} group`}>
```

And inside the `<summary>`, after the `language` badge line, add an identity badge:

```tsx
        {conversation.interviewer && (
          <Badge>{conversation.interviewer.name ?? "identified"}</Badge>
        )}
```

(Place it right after the `{conversation.language && <Badge>{conversation.language}</Badge>}` line.)

- [ ] **Step 5: Verify build + typecheck**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/admin-dashboard.tsx
git commit -m "feat(admin): surface interviewers in the dashboard"
```

---

## Task 9: Live identity chip in the chat UI

**Files:**
- Modify: `lib/language.ts`
- Modify: `components/chat.tsx`

- [ ] **Step 1: Add `identity` UI strings**

In `lib/language.ts`, add an `identity` block to **both** the `en` and `fr` objects. Place it after the `genericError` line in each.

For `en`:

```ts
    identity: {
      chipPrefix: "Recognized you as",
      hiring: "hiring",
    },
```

For `fr`:

```ts
    identity: {
      chipPrefix: "Vous avez été reconnu·e comme",
      hiring: "recrute pour",
    },
```

- [ ] **Step 2: Add the identity-chip logic and render it in `components/chat.tsx`**

Add this helper function above the `Chat` component (after `loadOrCreateConversationId`):

```tsx
type ChatIdentity = {
  name?: string;
  company?: string;
  hiringFor?: string;
};

/**
 * Find the most recent `identify_interviewer` tool call across the transcript.
 * The tool call streams as a `tool-identify_interviewer` part whose `input` is
 * the identity the agent supplied. Live-session only — not rehydrated.
 */
function latestIdentity(
  messages: { parts: { type: string }[] }[],
): ChatIdentity | null {
  let found: ChatIdentity | null = null;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "tool-identify_interviewer") {
        const input = (p as { input?: ChatIdentity }).input;
        if (input) found = input;
      }
    }
  }
  return found;
}
```

Inside the `Chat` component, after the `const { messages, sendMessage, status, error } = useChat({ transport });` line, derive the chip data:

```tsx
  const identity = useMemo(() => latestIdentity(messages), [messages]);
  const identitySummary = identity
    ? [
        identity.name,
        identity.company,
        identity.hiringFor ? `${t.identity.hiring} ${identity.hiringFor}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
```

(`useMemo` is already imported on line 5.)

Render the chip immediately **after** the closing `</header>` tag and before the scroll `<div ref={scrollRef} ...>`:

```tsx
      {identitySummary && (
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-card)]/40 px-5 py-1.5">
          <span
            className="font-mono text-[10px] uppercase text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.18em" }}
          >
            {t.identity.chipPrefix}: {identitySummary}
          </span>
        </div>
      )}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/language.ts components/chat.tsx
git commit -m "feat(chat): live identity chip when the visitor is recognized"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all tests green, including the new `tests/lib/interviewer/`, `tests/lib/admin/data.test.ts`, and the additions to `answerer.test.ts` / `mcp/tools.test.ts`.

- [ ] **Step 2: Run typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS for both.

- [ ] **Step 3: Apply the migration locally (if a dev DB is configured)**

Run: `pnpm db:migrate`
Expected: the `interviewer` column migration applies cleanly. (Skip if no local DB env is set; the migration is committed in Task 1 and applies on the next deploy.)

- [ ] **Step 4: Manual smoke test (optional, requires API key + DB)**

Run `pnpm dev`, open the chat, send: *"Hi, I'm Sarah from Acme, we're hiring a CTO."* Confirm the identity chip appears under the chat header. Open `/admin` and confirm the conversation appears in the Interviewers section with name/company/hiring-for.

---

## Notes for the implementer

- **TDD order matters.** Tasks 2, 3, 5, 7 each write a failing test first, watch it fail, then implement. Do not skip the "verify it fails" step.
- **`execute` never throws.** The `identify_interviewer` tool catches persistence errors and returns `{ ok: false }` — identity capture is best-effort and must never abort an answer.
- **No merge logic.** The agent re-states the full identity each call; `setInterviewer` overwrites. This is intentional (see the design doc).
- **The migration filename is generated** — Task 1 Step 2 produces a `00NN_<random>.sql` file. Commit whatever drizzle-kit generates.

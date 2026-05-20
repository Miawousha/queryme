# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose queryme's CV agent over the Model Context Protocol via a single Streamable-HTTP endpoint inside the existing Next.js app, with four tools (`ask`, `request_identification`, `verify_identification`, `forward_question`) at full parity with the web chat.

**Architecture:** A new `app/api/mcp/route.ts` (Next.js App Router, `runtime = "nodejs"`) handles the Streamable-HTTP transport (`POST`/`GET`/`DELETE`). `lib/mcp/server.ts` builds an `McpServer` and registers the four tools with zod input schemas. `lib/mcp/tools.ts` holds the four tool handlers as testable, dependency-injected functions that are thin wrappers over the Plan 2 `lib/` functions (`answer`, `requestIdentification`, `verifyIdentification`, `forwardQuestion`) — no business logic is reimplemented.

**Tech Stack:** `@modelcontextprotocol/sdk` (Streamable-HTTP server transport + `McpServer`), zod ^4.4.3, plus everything from Plans 1 and 2 (Next.js 15.5, React 19, TypeScript strict, Drizzle, Upstash Redis, vitest ^4.1.7).

**Starts from:** main branch (Plan 2 shipped).

---

## File structure produced by this plan

```
queryme/
├── package.json                       # Modified Task 1 — +@modelcontextprotocol/sdk
├── README.md                          # Modified Task 7 — document the MCP endpoint
│
├── lib/
│   └── mcp/
│       ├── tools.ts                   # Task 3 — four tool handlers (DI, thin wrappers over lib/)
│       └── server.ts                  # Task 5 — McpServer factory, registers the four tools
│
├── app/
│   └── api/
│       └── mcp/
│           └── route.ts               # Task 6 — Streamable-HTTP route: POST + GET + DELETE
│
└── tests/
    └── lib/
        └── mcp/
            ├── tools.test.ts          # Task 2 (failing) → Task 4 (extended) — handler unit tests
            └── server.test.ts         # Task 5 — tool-registration smoke test
```

**Conventions:**
- TDD strictly where there is testable logic: write the failing test, run it, implement, run it green. Don't skip the failing-test step.
- Commit after each task with the message in the final step.
- All paths relative to `/Users/alexandrecollet/queryme`. Run all commands from the repo root.
- `pnpm` is the package manager. `pnpm test` = `vitest run --passWithNoTests`; `pnpm typecheck` = `tsc --noEmit`.
- Tests inject `MemoryKv` (from `lib/kv/client.ts`) and hand-written stubs for the `db` and `lib/` functions — exactly as Plan 2 tested `lib/identity/*`. No real Postgres / Redis / Anthropic / Resend needed for CI.
- Path alias `@/*` maps to the repo root.

---

## Task 1: Install the MCP SDK dependency

No tests; this is dependency setup. Success criterion: `pnpm typecheck` + `pnpm test` still pass with the full Plan 2 suite.

**Files:**
- Modify: `package.json` (deps)
- Modify: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Install the MCP SDK**

```bash
pnpm add @modelcontextprotocol/sdk
```

Expected: pnpm adds `@modelcontextprotocol/sdk` to `dependencies` in `package.json` and updates `pnpm-lock.yaml`. No peer-dependency errors.

- [ ] **Step 2: Confirm the package resolved and note its API surface**

```bash
pnpm ls @modelcontextprotocol/sdk
ls node_modules/@modelcontextprotocol/sdk/dist/cjs/server
```

Expected: `pnpm ls` prints the installed version (e.g. `@modelcontextprotocol/sdk 1.x.x`). The directory listing shows `mcp.js` (the `McpServer`) and a `streamableHttp.js` (the `StreamableHTTPServerTransport`). If the directory layout differs, open `node_modules/@modelcontextprotocol/sdk/package.json` and read its `exports` map — the import paths used later in this plan (`@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/streamableHttp.js`) are the documented subpath exports; adjust only if the package's `exports` map proves otherwise.

- [ ] **Step 3: Verify nothing is broken**

```bash
pnpm typecheck
pnpm test
```

Expected: typecheck clean; the full Plan 2 test suite still passes (no new and no removed tests).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(mcp): add @modelcontextprotocol/sdk dependency"
```

---

## Task 2: Failing unit tests for the `ask` and `forward_question` tool handlers

Write the tests first. They import handlers that do not exist yet, so the suite fails to compile — that is the expected "red" state. Task 3 implements the handlers to make them green.

**Files:**
- Create: `tests/lib/mcp/tools.test.ts`

- [ ] **Step 1: Write `tests/lib/mcp/tools.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { MemoryKv } from "@/lib/kv/client";
import { handleAsk, handleForwardQuestion } from "@/lib/mcp/tools";
import type { AskDeps, ForwardQuestionDeps } from "@/lib/mcp/tools";

// A minimal in-memory conversation store standing in for the Drizzle `db`.
// Only the methods the handlers call are implemented.
function makeConversationStore() {
  const rows = new Map<string, { id: string; channel: string; transcript: { role: "user" | "assistant"; text: string; at: string }[] }>();
  return {
    rows,
    getOrCreateConversation: async (
      _db: unknown,
      input: { id: string; channel: "chat" | "mcp" },
    ) => {
      let row = rows.get(input.id);
      if (!row) {
        row = { id: input.id, channel: input.channel, transcript: [] };
        rows.set(input.id, row);
      }
      return row;
    },
    appendTurn: async (
      _db: unknown,
      conversationId: string,
      turn: { role: "user" | "assistant"; text: string; at: string },
    ) => {
      const row = rows.get(conversationId);
      if (!row) throw new Error(`appendTurn: conversation ${conversationId} does not exist`);
      row.transcript.push(turn);
    },
  };
}

describe("handleAsk", () => {
  it("generates a conversationId when omitted and returns it", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();
    const deps: AskDeps = {
      db: {} as never,
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async () => "the answer",
    };

    const result = await handleAsk(deps, { question: "What is your experience?" });

    expect(result.answer).toBe("the answer");
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a provided conversationId and reconstructs history from the transcript", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();
    const convId = "11111111-1111-4111-8111-111111111111";
    // Seed a prior conversation with one full turn pair.
    store.rows.set(convId, {
      id: convId,
      channel: "mcp",
      transcript: [
        { role: "user", text: "earlier question", at: "2026-05-20T00:00:00.000Z" },
        { role: "assistant", text: "earlier answer", at: "2026-05-20T00:00:01.000Z" },
      ],
    });

    let seenMessages: { role: string; content: string }[] = [];
    const deps: AskDeps = {
      db: {} as never,
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async ({ messages }) => {
        seenMessages = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return "fresh answer";
      },
    };

    const result = await handleAsk(deps, { question: "follow-up question", conversationId: convId });

    expect(result.conversationId).toBe(convId);
    // History (2 prior turns) + the new user question.
    expect(seenMessages).toEqual([
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "follow-up question" },
    ]);
    // Both the new user turn and the assistant turn were appended.
    expect(store.rows.get(convId)!.transcript.map((t) => t.text)).toEqual([
      "earlier question",
      "earlier answer",
      "follow-up question",
      "fresh answer",
    ]);
  });

  it("passes sensitive KB text to produceAnswer only when the conversation is unlocked", async () => {
    const store = makeConversationStore();
    const kv = new MemoryKv();

    let sawSensitive: string | undefined;
    const baseDeps = (unlocked: boolean): AskDeps => ({
      db: {} as never,
      kv,
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => unlocked,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async ({ sensitiveKbText }) => {
        sawSensitive = sensitiveKbText;
        return "ok";
      },
    });

    sawSensitive = "untouched";
    await handleAsk(baseDeps(false), { question: "q1" });
    expect(sawSensitive).toBeUndefined();

    sawSensitive = "untouched";
    await handleAsk(baseDeps(true), { question: "q2" });
    expect(sawSensitive).toBe("SENSITIVE KB");
  });

  it("rejects an empty question via input validation", async () => {
    const store = makeConversationStore();
    const deps: AskDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      getOrCreateConversation: store.getOrCreateConversation,
      appendTurn: store.appendTurn,
      isConversationUnlocked: async () => false,
      loadPublicKbText: async () => "PUBLIC KB",
      loadSensitiveKbText: async () => "SENSITIVE KB",
      produceAnswer: async () => "x",
    };

    await expect(handleAsk(deps, { question: "" })).rejects.toThrow();
  });
});

describe("handleForwardQuestion", () => {
  it("forwards a question and returns ok + id, generating a conversationId when omitted", async () => {
    let forwarded: { question: string; conversationId?: string } | null = null;
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async (_db, input) => {
        forwarded = input;
        return { id: "q-123" } as never;
      },
    };

    const result = await handleForwardQuestion(deps, { question: "Are you open to relocation?" });

    expect(result).toEqual({ ok: true, id: "q-123" });
    expect(forwarded!.question).toBe("Are you open to relocation?");
    expect(forwarded!.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("passes through a provided conversationId", async () => {
    let forwarded: { question: string; conversationId?: string } | null = null;
    const convId = "22222222-2222-4222-8222-222222222222";
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async (_db, input) => {
        forwarded = input;
        return { id: "q-456" } as never;
      },
    };

    const result = await handleForwardQuestion(deps, {
      question: "What's your notice period?",
      conversationId: convId,
    });

    expect(result).toEqual({ ok: true, id: "q-456" });
    expect(forwarded!.conversationId).toBe(convId);
  });

  it("rejects an empty question via input validation", async () => {
    const deps: ForwardQuestionDeps = {
      db: {} as never,
      forwardQuestion: async () => ({ id: "x" }) as never,
    };
    await expect(handleForwardQuestion(deps, { question: "" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails to compile**

```bash
pnpm test tests/lib/mcp/tools.test.ts
```

Expected: the run FAILS — vitest cannot resolve `@/lib/mcp/tools` (the module does not exist yet). This is the intended red state.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/lib/mcp/tools.test.ts
git commit -m "test(mcp): failing unit tests for ask + forward_question handlers"
```

---

## Task 3: Implement `ask` and `forward_question` tool handlers

Implement `lib/mcp/tools.ts` with the `ask` and `forward_question` handlers (the identification handlers are added in Task 4). Handlers are dependency-injected: every external collaborator (`db`, `kv`, the `lib/` functions, KB loaders, answer producer) arrives via a `deps` object so the tests in Task 2 can inject stubs.

**Files:**
- Create: `lib/mcp/tools.ts`

- [ ] **Step 1: Write `lib/mcp/tools.ts`**

```typescript
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelMessage } from "ai";
import type { getDb } from "@/lib/db/client";
import type { KvClient } from "@/lib/kv/client";
import type { Conversation, ConversationTurn } from "@/lib/db/schema";
import type { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import type { isConversationUnlocked } from "@/lib/identity/tokens";
import type { forwardQuestion } from "@/lib/questions/repo";
import type { requestIdentification, verifyIdentification } from "@/lib/identity/service";

type Db = ReturnType<typeof getDb>;

// --- Zod input schemas (also re-used by lib/mcp/server.ts) ---

export const AskInputSchema = z.object({
  question: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});
export type AskInput = z.infer<typeof AskInputSchema>;

export const ForwardQuestionInputSchema = z.object({
  question: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});
export type ForwardQuestionInput = z.infer<typeof ForwardQuestionInputSchema>;

export const RequestIdentificationInputSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  workEmail: z.string().email().max(320),
  role: z.string().min(1).max(200),
  purpose: z.string().max(2000).optional(),
});
export type RequestIdentificationInput = z.infer<typeof RequestIdentificationInputSchema>;

export const VerifyIdentificationInputSchema = z.object({
  conversationId: z.string().uuid(),
  workEmail: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});
export type VerifyIdentificationInput = z.infer<typeof VerifyIdentificationInputSchema>;

// --- ask ---

export type ProduceAnswerArgs = {
  messages: ModelMessage[];
  kbText: string;
  sensitiveKbText?: string;
};

export type AskDeps = {
  db: Db;
  kv: KvClient;
  getOrCreateConversation: typeof getOrCreateConversation;
  appendTurn: typeof appendTurn;
  isConversationUnlocked: typeof isConversationUnlocked;
  loadPublicKbText: () => Promise<string>;
  loadSensitiveKbText: () => Promise<string>;
  produceAnswer: (args: ProduceAnswerArgs) => Promise<string>;
};

export type AskResult = { answer: string; conversationId: string };

function transcriptToMessages(transcript: ConversationTurn[]): ModelMessage[] {
  return transcript.map((turn) => ({ role: turn.role, content: turn.text }));
}

export async function handleAsk(deps: AskDeps, rawInput: unknown): Promise<AskResult> {
  const input = AskInputSchema.parse(rawInput);
  const conversationId = input.conversationId ?? randomUUID();

  const conversation: Conversation = await deps.getOrCreateConversation(deps.db, {
    id: conversationId,
    channel: "mcp",
  });

  const unlocked = await deps.isConversationUnlocked(deps.kv, conversationId);

  const kbText = await deps.loadPublicKbText();
  const sensitiveKbText = unlocked ? await deps.loadSensitiveKbText() : "";

  // Reconstruct prior history from the stored transcript, then append the
  // new user question. MCP `ask` is stateless across calls — the transcript
  // is the source of truth.
  const messages: ModelMessage[] = [
    ...transcriptToMessages(conversation.transcript ?? []),
    { role: "user", content: input.question },
  ];

  await deps.appendTurn(deps.db, conversationId, {
    role: "user",
    text: input.question,
    at: new Date().toISOString(),
  });

  const answerText = await deps.produceAnswer({
    messages,
    kbText,
    sensitiveKbText: sensitiveKbText || undefined,
  });

  await deps.appendTurn(deps.db, conversationId, {
    role: "assistant",
    text: answerText,
    at: new Date().toISOString(),
  });

  return { answer: answerText, conversationId };
}

// --- forward_question ---

export type ForwardQuestionDeps = {
  db: Db;
  forwardQuestion: typeof forwardQuestion;
};

export type ForwardQuestionResult = { ok: true; id: string };

export async function handleForwardQuestion(
  deps: ForwardQuestionDeps,
  rawInput: unknown,
): Promise<ForwardQuestionResult> {
  const input = ForwardQuestionInputSchema.parse(rawInput);
  const conversationId = input.conversationId ?? randomUUID();

  const inserted = await deps.forwardQuestion(deps.db, {
    question: input.question,
    conversationId,
  });

  return { ok: true, id: inserted.id };
}

// --- request_identification ---

export type RequestIdentificationDeps = {
  db: Db;
  kv: KvClient;
  requestIdentification: typeof requestIdentification;
  send: Parameters<typeof requestIdentification>[0]["send"];
};

export type RequestIdentificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function handleRequestIdentification(
  deps: RequestIdentificationDeps,
  rawInput: unknown,
): Promise<RequestIdentificationResult> {
  const input = RequestIdentificationInputSchema.parse(rawInput);

  const result = await deps.requestIdentification(
    { db: deps.db, kv: deps.kv, send: deps.send },
    {
      conversationId: input.conversationId,
      name: input.name,
      company: input.company,
      workEmail: input.workEmail,
      role: input.role,
      purpose: input.purpose,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "invalid_email_domain"
          ? "A work email from a company domain is required (free-email providers are not accepted)."
          : `Identification request failed: ${result.reason}`,
    };
  }

  return { ok: true };
}

// --- verify_identification ---

export type VerifyIdentificationDeps = {
  db: Db;
  kv: KvClient;
  verifyIdentification: typeof verifyIdentification;
};

export type VerifyIdentificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function handleVerifyIdentification(
  deps: VerifyIdentificationDeps,
  rawInput: unknown,
): Promise<VerifyIdentificationResult> {
  const input = VerifyIdentificationInputSchema.parse(rawInput);

  const result = await deps.verifyIdentification(
    { db: deps.db, kv: deps.kv },
    {
      conversationId: input.conversationId,
      workEmail: input.workEmail,
      code: input.code,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "code_invalid"
          ? "The verification code is invalid or has expired."
          : "No matching identification request was found for this email.",
    };
  }

  return { ok: true };
}
```

> Implementation note: `lib/mcp/tools.ts` is written ahead of the `request_identification` / `verify_identification` tests, but Task 4 adds the tests that exercise `handleRequestIdentification` and `handleVerifyIdentification`. Writing all four handlers now (with full code) keeps the module internally consistent — the schemas are shared. The TDD red→green cycle for the identification handlers happens in Task 4.

- [ ] **Step 2: Run the Task 2 tests — confirm they pass**

```bash
pnpm test tests/lib/mcp/tools.test.ts
```

Expected: all `handleAsk` and `handleForwardQuestion` tests pass (7 tests green).

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/mcp/tools.ts
git commit -m "feat(mcp): ask + forward_question tool handlers (DI wrappers over lib/)"
```

---

## Task 4: Unit tests for the identification tool handlers

The handlers already exist (written in Task 3). This task adds their tests — write the tests, run them against the existing implementation, confirm green. (If a test reveals a bug, fix `lib/mcp/tools.ts`; the spec maps each handler 1:1 to a `lib/` function, so the expected behaviour is fixed.)

**Files:**
- Modify: `tests/lib/mcp/tools.test.ts` (append the identification suites)

- [ ] **Step 1: Append to `tests/lib/mcp/tools.test.ts`**

Add these imports to the existing import block at the top of the file:

```typescript
import { handleRequestIdentification, handleVerifyIdentification } from "@/lib/mcp/tools";
import type { RequestIdentificationDeps, VerifyIdentificationDeps } from "@/lib/mcp/tools";
```

Append these two `describe` blocks at the end of the file:

```typescript
describe("handleRequestIdentification", () => {
  const validInput = {
    conversationId: "33333333-3333-4333-8333-333333333333",
    name: "Dana Recruiter",
    company: "Acme Corp",
    workEmail: "dana@acme.com",
    role: "Talent Partner",
    purpose: "Evaluating for a staff role",
  };

  it("calls requestIdentification with mapped args and returns ok on success", async () => {
    let received: unknown = null;
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async (_d, input) => {
        received = input;
        return { ok: true };
      },
      send: async () => {},
    };

    const result = await handleRequestIdentification(deps, validInput);

    expect(result).toEqual({ ok: true });
    expect(received).toEqual({
      conversationId: validInput.conversationId,
      name: validInput.name,
      company: validInput.company,
      workEmail: validInput.workEmail,
      role: validInput.role,
      purpose: validInput.purpose,
    });
  });

  it("maps an invalid_email_domain reason to a descriptive error", async () => {
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async () => ({ ok: false, reason: "invalid_email_domain" }),
      send: async () => {},
    };

    const result = await handleRequestIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/work email/i);
  });

  it("rejects a missing conversationId via input validation", async () => {
    const deps: RequestIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      requestIdentification: async () => ({ ok: true }),
      send: async () => {},
    };
    const { conversationId, ...withoutConvId } = validInput;
    void conversationId;
    await expect(handleRequestIdentification(deps, withoutConvId)).rejects.toThrow();
  });
});

describe("handleVerifyIdentification", () => {
  const validInput = {
    conversationId: "44444444-4444-4444-8444-444444444444",
    workEmail: "dana@acme.com",
    code: "920742",
  };

  it("calls verifyIdentification with mapped args and returns ok on success", async () => {
    let received: unknown = null;
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async (_d, input) => {
        received = input;
        return { ok: true, token: "tok-abc", askerId: "asker-1" };
      },
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result).toEqual({ ok: true });
    expect(received).toEqual(validInput);
  });

  it("maps a code_invalid reason to a descriptive error", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: false, reason: "code_invalid" }),
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid|expired/i);
  });

  it("maps an asker_not_found reason to a descriptive error", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: false, reason: "asker_not_found" }),
    };

    const result = await handleVerifyIdentification(deps, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no matching/i);
  });

  it("rejects a non-6-digit code via input validation", async () => {
    const deps: VerifyIdentificationDeps = {
      db: {} as never,
      kv: new MemoryKv(),
      verifyIdentification: async () => ({ ok: true, token: "t", askerId: "a" }),
    };
    await expect(
      handleVerifyIdentification(deps, { ...validInput, code: "12345" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the full handler test file**

```bash
pnpm test tests/lib/mcp/tools.test.ts
```

Expected: all suites green — `handleAsk` (4), `handleForwardQuestion` (3), `handleRequestIdentification` (3), `handleVerifyIdentification` (4) = 14 tests pass.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/mcp/tools.test.ts
git commit -m "test(mcp): unit tests for request_identification + verify_identification handlers"
```

---

## Task 5: MCP server factory + registration smoke test

Build `lib/mcp/server.ts`: a `buildMcpServer` factory that creates an `McpServer` and registers the four tools with their zod input schemas. Each registered tool wires the real production collaborators (`getDb`, `getKv`, the `lib/` functions, KB loaders, the `answer` producer) into the corresponding handler and shapes the handler result into an MCP tool result. The smoke test asserts the four tools are registered.

**Files:**
- Create: `lib/mcp/server.ts`
- Create: `tests/lib/mcp/server.test.ts`

- [ ] **Step 1: Write `tests/lib/mcp/server.test.ts` (failing — module does not exist yet)**

```typescript
import { describe, it, expect } from "vitest";
import { buildMcpServer } from "@/lib/mcp/server";

describe("buildMcpServer", () => {
  it("registers exactly the four expected tools", async () => {
    const server = buildMcpServer();
    // The McpServer exposes the underlying protocol Server; list registered tools
    // through the public list-tools request handler.
    const result = await server.server.request(
      { method: "tools/list", params: {} },
      // The SDK validates responses against its ListToolsResult schema.
      (await import("@modelcontextprotocol/sdk/types.js")).ListToolsResultSchema,
    );
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "ask",
      "forward_question",
      "request_identification",
      "verify_identification",
    ]);
  });
});
```

> Implementation note: the exact way to enumerate registered tools depends on the installed SDK version. The approach above issues an in-process `tools/list` request. If the installed SDK exposes a simpler accessor (some versions keep a `_registeredTools` map on `McpServer`), use that instead — but the assertion (four tool names, sorted) stays identical. Confirm against `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts` at implementation time.

- [ ] **Step 2: Run the test — confirm it fails**

```bash
pnpm test tests/lib/mcp/server.test.ts
```

Expected: FAILS — `@/lib/mcp/server` does not exist. Intended red state.

- [ ] **Step 3: Write `lib/mcp/server.ts`**

```typescript
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText, assembleSensitiveKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import { isConversationUnlocked } from "@/lib/identity/tokens";
import { forwardQuestion } from "@/lib/questions/repo";
import { requestIdentification, verifyIdentification } from "@/lib/identity/service";
import { sendVerificationCode } from "@/lib/identity/resend";
import {
  handleAsk,
  handleForwardQuestion,
  handleRequestIdentification,
  handleVerifyIdentification,
  AskInputSchema,
  ForwardQuestionInputSchema,
  RequestIdentificationInputSchema,
  VerifyIdentificationInputSchema,
} from "@/lib/mcp/tools";

// Public KB text is immutable for the process lifetime — load once.
let cachedPublicKbText: string | null = null;

async function loadPublicKbText(): Promise<string> {
  if (cachedPublicKbText !== null) return cachedPublicKbText;
  const kb = await loadKb(path.resolve(process.cwd(), "kb"));
  cachedPublicKbText = assemblePublicKbText(kb);
  return cachedPublicKbText;
}

async function loadSensitiveKbText(): Promise<string> {
  const kb = await loadKb(path.resolve(process.cwd(), "kb"));
  return assembleSensitiveKbText(kb.sensitive);
}

// Wrap a handler result object into a standard MCP tool result: JSON text
// content, with `isError` set when the handler reports a failure.
function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError,
  };
}

// Map a thrown error (e.g. zod validation failure) into an MCP tool error.
function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return jsonResult({ ok: false, error: message }, true);
}

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "queryme", version: "1.0.0" },
    {
      instructions:
        "queryme exposes a candidate's CV as an interactive agent. Use `ask` for " +
        "questions about public CV content; reuse the returned conversationId on " +
        "follow-ups. To access sensitive content (salary, references, private " +
        "contact), call `request_identification` with the principal's work email, " +
        "then `verify_identification` with the 6-digit code they receive. Use " +
        "`forward_question` to leave a question for the candidate to answer later.",
    },
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the CV agent",
      description:
        "Ask a question about the candidate. Returns the full answer and a " +
        "conversationId — pass that conversationId back on follow-up calls to " +
        "keep context. Sensitive content is only included after identification.",
      inputSchema: AskInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleAsk(
          {
            db: getDb(),
            kv: getKv(),
            getOrCreateConversation,
            appendTurn,
            isConversationUnlocked,
            loadPublicKbText,
            loadSensitiveKbText,
            produceAnswer: async ({ messages, kbText, sensitiveKbText }) => {
              const streamed = await answer({ messages, kbText, sensitiveKbText });
              return await streamed.text;
            },
          },
          args,
        );
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "request_identification",
    {
      title: "Request identification",
      description:
        "Send a 6-digit verification code to the principal's work email so the " +
        "conversation can be unlocked for sensitive content. Free-email domains " +
        "are rejected.",
      inputSchema: RequestIdentificationInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleRequestIdentification(
          {
            db: getDb(),
            kv: getKv(),
            requestIdentification,
            send: sendVerificationCode,
          },
          args,
        );
        return jsonResult(result, !result.ok);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "verify_identification",
    {
      title: "Verify identification",
      description:
        "Submit the 6-digit code the principal received by email. On success the " +
        "conversation is unlocked and subsequent `ask` calls include sensitive content.",
      inputSchema: VerifyIdentificationInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleVerifyIdentification(
          { db: getDb(), kv: getKv(), verifyIdentification },
          args,
        );
        return jsonResult(result, !result.ok);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "forward_question",
    {
      title: "Forward a question to the candidate",
      description:
        "Leave a question for the candidate to answer later. Returns the queued " +
        "question id.",
      inputSchema: ForwardQuestionInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleForwardQuestion({ db: getDb(), forwardQuestion }, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
```

> Implementation note: `registerTool` (with `{ title, description, inputSchema }` and a handler) is the current `McpServer` API. `inputSchema` takes a zod *raw shape* (`schema.shape`), which the SDK wraps internally. If the installed SDK version differs (e.g. older `server.tool(name, shape, handler)`), adapt the call site only — the four tool names, schemas, descriptions, and handler wiring stay exactly as written. Confirm against `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts`.

- [ ] **Step 4: Run the smoke test — confirm it passes**

```bash
pnpm test tests/lib/mcp/server.test.ts
```

Expected: the registration smoke test passes (1 test green — four tool names).

- [ ] **Step 5: Run the full MCP test suite + typecheck**

```bash
pnpm test tests/lib/mcp/
pnpm typecheck
```

Expected: all MCP tests green (14 handler tests + 1 smoke test); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/server.ts tests/lib/mcp/server.test.ts
git commit -m "feat(mcp): McpServer factory registering the four tools"
```

---

## Task 6: Streamable-HTTP route (`POST` / `GET` / `DELETE`)

Create `app/api/mcp/route.ts`: a Next.js App Router route that bridges the Web `Request`/`Response` API to the MCP SDK's `StreamableHTTPServerTransport`. It applies IP-keyed rate limiting before handing the request to the transport, and supports the Streamable-HTTP session lifecycle (`POST` for JSON-RPC, `GET` for the server→client SSE stream, `DELETE` for teardown).

**Files:**
- Create: `app/api/mcp/route.ts`

- [ ] **Step 1: Write `app/api/mcp/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

export const runtime = "nodejs";

// One transport + server pair per process. The MCP session is identified by
// the `mcp-session-id` header the transport assigns on initialization; we keep
// a single server instance and let the transport manage sessions.
let transportPromise: Promise<StreamableHTTPServerTransport> | null = null;

async function getTransport(): Promise<StreamableHTTPServerTransport> {
  if (transportPromise) return transportPromise;
  transportPromise = (async () => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = buildMcpServer();
    await server.connect(transport);
    return transport;
  })();
  return transportPromise;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Rate limit MCP traffic by IP. The limit is generous — a single agent issues
// many JSON-RPC messages per session — and exists to stop abuse, not normal use.
async function rateLimited(req: NextRequest): Promise<boolean> {
  const kv = getKv();
  const result = await checkRateLimit(kv, {
    key: `mcp:${clientIp(req)}`,
    limit: 120,
    windowSeconds: 60,
  });
  return !result.allowed;
}

// Bridge: read the Web Request body, drive the SDK transport with Node-style
// req/res shims, and return a Web Response with whatever the transport wrote.
async function handle(req: NextRequest): Promise<Response> {
  if (await rateLimited(req)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded. Try again shortly." },
        id: null,
      },
      { status: 429 },
    );
  }

  const transport = await getTransport();

  const bodyText = req.method === "POST" ? await req.text() : "";
  const parsedBody = bodyText ? JSON.parse(bodyText) : undefined;

  // Minimal Node-style request shim the transport reads headers/method from.
  const nodeReq = {
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
  } as never;

  // Collect what the transport writes, then materialize a Web Response.
  let statusCode = 200;
  const responseHeaders: Record<string, string> = {};
  const chunks: string[] = [];
  let resolveDone: () => void;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const nodeRes = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      responseHeaders[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return responseHeaders[name.toLowerCase()];
    },
    writeHead(code: number, headers?: Record<string, string>) {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          responseHeaders[k.toLowerCase()] = v;
        }
      }
      return this;
    },
    write(chunk: string) {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(typeof chunk === "string" ? chunk : String(chunk));
      statusCode = (this as { statusCode: number }).statusCode || statusCode;
      resolveDone();
    },
    on() {
      return this;
    },
  } as never;

  await transport.handleRequest(nodeReq, nodeRes, parsedBody);
  await done;

  return new Response(chunks.join("") || null, {
    status: statusCode,
    headers: responseHeaders,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
```

> Implementation note: the MCP SDK's `StreamableHTTPServerTransport.handleRequest(req, res, body)` is designed for Node's `http` `IncomingMessage`/`ServerResponse`. Next.js App Router routes receive Web `Request` and return Web `Response`, so the route shims a minimal `req`/`res` pair (above). This shim covers the JSON-RPC request/response path the four tools need. If the installed SDK version exposes a Web-native `handleRequest` (some versions accept a `Request` directly), prefer it and delete the shim — the rate-limiting wrapper, `runtime`, and exported `POST`/`GET`/`DELETE` stay unchanged. Confirm the transport's `handleRequest` signature against `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp.d.ts` before finalizing.

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Verify the route compiles in a production build**

```bash
pnpm build
```

Expected: `next build` succeeds; the build output lists `/api/mcp` as a route (a dynamic `ƒ` server route under `runtime: nodejs`). `pnpm validate:kb` (run by the `build` script) also passes.

- [ ] **Step 4: Smoke-test the endpoint against a dev server (manual)**

Start the dev server in one terminal:

```bash
pnpm dev
```

In a second terminal, send an `initialize` JSON-RPC request:

```bash
curl -i -s -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

Expected: HTTP `200`, a `mcp-session-id` response header, and a JSON-RPC result body whose `result.serverInfo.name` is `"queryme"` and `result.capabilities.tools` is present. (If `getDb`/`getKv` env vars are unset locally, `initialize` and `tools/list` still succeed — only the tool-call paths touch the DB/KV. A `429` here means the IP hit the rate limit; wait 60s.) Stop the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/route.ts
git commit -m "feat(mcp): Streamable-HTTP route (POST/GET/DELETE) with IP rate limiting"
```

---

## Task 7: Document the MCP endpoint + final verification

Update the README with an MCP section, then run the full verification gate.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an MCP section to `README.md`**

Open `README.md`. Add the following section (place it after the API / endpoints section, or near the end if there is no such section):

```markdown
## MCP server

queryme exposes the CV agent over the [Model Context Protocol](https://modelcontextprotocol.io)
at a single Streamable-HTTP endpoint:

```
POST /api/mcp     — JSON-RPC requests
GET  /api/mcp     — server→client SSE stream
DELETE /api/mcp   — session teardown
```

Point any MCP client at `https://<deployment>/api/mcp` (Streamable-HTTP transport).
The endpoint is **public** — querying public CV content needs no credentials.

### Tools

| Tool | Input | Result |
|---|---|---|
| `ask` | `question` (string), `conversationId?` (uuid) | `{ answer, conversationId }` — reuse `conversationId` on follow-ups |
| `request_identification` | `conversationId`, `name`, `company`, `workEmail`, `role`, `purpose?` | `{ ok: true }` — emails a 6-digit code; free-email domains rejected |
| `verify_identification` | `conversationId`, `workEmail`, `code` (6 digits) | `{ ok: true }` — unlocks sensitive content for that conversation |
| `forward_question` | `question` (string), `conversationId?` (uuid) | `{ ok: true, id }` — queues a question for the candidate |

### Accessing sensitive content

Salary, references, and private contact are gated. To unlock them for a
conversation: call `request_identification` with the principal's work email,
have them read back the 6-digit code from their inbox, then call
`verify_identification`. Subsequent `ask` calls on the same `conversationId`
include sensitive content. This is the same email-code flow as the web chat —
there is no separate MCP OAuth.

Requests are rate-limited per client IP.
```

- [ ] **Step 2: Run the full verification gate**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: typecheck clean; the entire test suite passes (the Plan 2 suite plus the 15 new MCP tests — 14 in `tests/lib/mcp/tools.test.ts`, 1 in `tests/lib/mcp/server.test.ts`); `pnpm build` succeeds with `/api/mcp` listed as a route.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(mcp): document the MCP endpoint, tools, and identification flow"
```

---

## Plan complete

End state: queryme serves an MCP Streamable-HTTP endpoint at `/api/mcp` with four tools (`ask`, `request_identification`, `verify_identification`, `forward_question`), each a thin, unit-tested wrapper over the existing Plan 2 `lib/` functions. Public content is open; sensitive content is gated behind the same email-code identification flow as the web chat. Per-IP rate limiting protects the endpoint. All tests pass and the production build succeeds.

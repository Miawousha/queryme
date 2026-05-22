# Interviewer Identification — Design

**Date:** 2026-05-22
**Status:** Approved, ready for implementation planning
**Branch:** `feat/interviewer-identification`

## Background

queryme is Alexandre Collet's "queryable CV": a Next.js agent that answers
questions about his background, exposed over both a web chat and an MCP server.
Visitors are typically recruiters, HR people, and hiring managers (or AI agents
acting for them).

This feature gives the agent the ability to recognize *who* it is talking to —
the person's name, company, their role, what they are hiring for, and any
contact details — and surface that in the password-gated `/admin` dashboard.

This is the first of two related specs. MCP access logging is a separate spec
and is **out of scope** here.

## Goals

- Capture interviewer identity automatically from the conversation itself, with
  no form and no separate analysis pass.
- Stay true to the app's radical-transparency ethos: nothing hidden, everything
  in the open repo, and the visitor can see they have been recognized.
- Surface identity in the `/admin` dashboard.

## Non-goals

- MCP access logs (separate spec).
- Cross-conversation identity resolution / dedup (a returning visitor is a fresh
  identity each conversation).
- A visitor-facing form or correction UI.
- Persisting/rehydrating the visitor chip across page reloads.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Capture mechanism | A real AI-SDK `tool()` the agent calls | The agent decides, mid-conversation, when identity has been revealed. |
| SDK | Vercel AI SDK (`ai` package) tool support | The app routes all model calls through `answer()`; the raw Anthropic SDK would fragment the model layer. |
| Capture trigger | Passive only — agent calls the tool when the visitor reveals identity | No form, no agent interrogation, no separate extraction pass. |
| Storage | Nullable `interviewer` `jsonb` column on `conversations` | Identity is a sub-record of its conversation, mutated in place — mirrors `transcript`. No new table. |
| Transparency | Disclosed + in repo: public tool code, system-prompt instruction, README note, live visitor chip | Matches the "nothing hidden" ethos. |
| Confidence | Single `basis` flag (`stated` vs `inferred`) on the whole identity | Enough to judge reliability without per-field bookkeeping. |
| Admin presentation | Both: a dedicated Interviewers section *and* per-conversation-row summary | Quick recruiter-focused view plus identity in context. |

## Data model

New nullable column on `conversations`:

```ts
interviewer: jsonb("interviewer").$type<InterviewerIdentity>()  // nullable
```

```ts
export type InterviewerIdentity = {
  name?: string;
  company?: string;
  role?: string;        // the visitor's own title, e.g. "VP Engineering"
  hiringFor?: string;   // the role/context they are recruiting for
  contact?: string;     // email / LinkedIn, if shared
  notes?: string;       // free-text context that doesn't fit a field
  basis: "stated" | "inferred";
  updatedAt: string;    // ISO timestamp, set server-side
};
```

Migration generated via `pnpm db:generate` and applied via `pnpm db:migrate`.

## Components

### `lib/interviewer/repo.ts`

`setInterviewer(db, conversationId, identity)` — overwrites the `interviewer`
column for the given conversation. Like `appendTurn`, it must error if the
`UPDATE` matched no rows (the conversation must already exist).

### `lib/interviewer/tool.ts`

`buildIdentifyTool({ db, conversationId })` returns an AI-SDK `tool()`:

- **Input schema** — a Zod object mirroring `InterviewerIdentity` minus
  `updatedAt`. All identity fields optional; `basis` required.
- **`execute`** — stamps `updatedAt` server-side, calls `setInterviewer`,
  returns `{ ok: true }`.
- Dependency-injected so it can be unit-tested with an in-memory store, in the
  style of `lib/mcp/tools.ts`.

The agent is instructed to pass the **complete** identity it knows so far on
each call; `execute` overwrites — no server-side merge logic.

### `lib/answerer.ts`

`answer()` gains an optional `tools` parameter, passed straight to
`streamText`, plus `stopWhen: stepCountIs(5)` so the model produces a final
text answer *after* a tool call (default `streamText` halts at the tool
result). When `tools` is absent, behaviour is unchanged.

### Callers

- `app/api/chat/route.ts` — builds the tool bound to `db` + `conversationId`
  and passes it to `answer()`. `getOrCreateConversation` already runs first, so
  the row exists when `execute` fires.
- `lib/mcp/tools.ts` `handleAsk` — also builds and passes the tool, so MCP
  conversations get identification too. `produceAnswer`'s `await streamed.text`
  still resolves to the final aggregated text across steps.

The existing `[[forward:...]]` inline marker is untouched.

## Data flow

1. Visitor chats. The agent reads the transcript each turn.
2. When the visitor reveals who they are, the agent calls
   `identify_interviewer` with everything it knows and a `basis` flag.
3. `execute` writes the identity to `conversations.interviewer`, then the agent
   continues and produces its final answer.
4. In the web chat, the tool call streams as a tool part; the client renders a
   live identity chip.
5. `/admin` reads `interviewer` straight off each conversation row.

## Visitor-facing chip (web chat only)

The `identify_interviewer` tool call streams as a tool part in the UI message
stream. The chat client scans message parts for the latest such part and
renders a chip near the chat header, e.g. *"Recognized you as: Sarah · Acme ·
hiring a CTO"*, updating as the agent learns more. This is the in-product
transparency surface. Live-session only — not persisted or rehydrated on
reload. MCP has no chip.

## Disclosure

- Tool code, its schema, and the system-prompt instructions all live in the
  public repo — default-public, like everything else.
- A new system-prompt section instructs the agent: call `identify_interviewer`
  when a visitor reveals their identity; set `basis` to `stated` vs `inferred`;
  and openly explain, if asked, that it notes who it is speaking with.
- A short note added to `README.md`.
- The live chip is the in-product disclosure.

## Admin dashboard

- `loadAdminData` returns `interviewer` for free (it is a column). Add an
  `identified` count to `AdminStats` and a derived `interviewers` list
  (conversations whose `interviewer` is non-null).
- **Dedicated "Interviewers" section** near the top: cards showing name ·
  company · role · hiring-for · contact · notes, with a `stated`/`inferred`
  badge, each linking to its conversation.
- **Conversation rows** also show an identity summary line and badge;
  identified conversations are visually marked.
- New stat tile: *"N identified"*.

## Error handling

- `setInterviewer` throws if the conversation row is missing (consistent with
  `appendTurn`).
- A tool `execute` failure must not abort the answer stream — the failure is
  caught/logged and the agent still answers (identity capture is best-effort).
- Zod validation on the tool input rejects malformed calls; the AI SDK surfaces
  that back to the model as a tool error.

## Testing

- `lib/interviewer/repo.ts` — `setInterviewer` writes; errors on missing row.
- `lib/interviewer/tool.ts` — `execute` stamps `updatedAt`, persists, returns
  `{ ok: true }`; rejects malformed input. Uses an injected in-memory store.
- `lib/answerer.ts` — with a stub model/tool: multi-step + `stopWhen` works;
  omitting `tools` leaves behaviour unchanged.
- `lib/admin/data.ts` — `identified` count and `interviewers` list are correct.
- `pnpm typecheck`, `pnpm test`, `pnpm build` all green.

## Out of scope / future work

- MCP access logging (next spec).
- Cross-conversation identity resolution.
- Visitor correction of captured identity.
- Chip rehydration across reloads.

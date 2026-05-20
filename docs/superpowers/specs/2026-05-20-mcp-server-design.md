# Plan 3 — MCP Server: design

> Status: **approved design**, ready for an implementation plan.
> Date: 2026-05-20. Follows Plan 2 (identification + sensitive content).

## Goal

Expose queryme's CV agent to AI agents over the Model Context Protocol, at full
parity with the web chat: an agent can query public content, identify its human
principal, unlock sensitive content, and forward questions — all via MCP tools.

## Why this is a thin layer

Plan 2 deliberately put the business logic in importable `lib/` functions
(`answer`, `requestIdentification`, `verifyIdentification`, `forwardQuestion`).
The HTTP routes are thin wrappers around them; the MCP tools are a second set of
thin wrappers around the same functions. No business logic is reimplemented.

## Architecture

A single Streamable-HTTP MCP endpoint inside the existing Next.js app — no new
service, same deployment, same `lib/`.

```
app/api/mcp/route.ts     # Streamable-HTTP route: POST + GET + DELETE
lib/mcp/server.ts        # builds the McpServer, registers tools
lib/mcp/tools.ts         # the four tool handlers (thin wrappers over lib/)
```

- Transport: raw `@modelcontextprotocol/sdk` with the Streamable-HTTP server
  transport. Chosen over an adapter library for zero third-party lock-in and
  maximum host portability (runs identically on Vercel and a future VPS).
- `route.ts` exports `POST` (JSON-RPC requests), `GET` (SSE stream for
  server→client messages), and `DELETE` (session teardown), per the
  Streamable-HTTP spec.
- `runtime = "nodejs"` (consistent with every other route; needed for `lib/db`
  and `node:crypto`).

## Tools

All tool inputs are validated with zod schemas (the MCP SDK accepts zod
natively). All four wrap existing `lib/` functions.

| Tool | Input | Wraps | Result |
|---|---|---|---|
| `ask` | `question: string`, `conversationId?: string` | `answer()` | `{ answer: string, conversationId: string }` |
| `request_identification` | `conversationId`, `name`, `company`, `workEmail`, `role`, `purpose?` | `requestIdentification()` | `{ ok: true }` or tool error |
| `verify_identification` | `conversationId`, `workEmail`, `code` (6 digits) | `verifyIdentification()` | `{ ok: true }` or tool error |
| `forward_question` | `question: string`, `conversationId?: string` | `forwardQuestion()` | `{ ok: true, id: string }` |

### `ask` behaviour

1. `conversationId` — if the agent omits it, the server generates a UUID and
   returns it in the result. The agent reuses it on subsequent calls.
2. `getOrCreateConversation(db, { id, channel: "mcp" })` — logs under the `mcp`
   channel (the `conversations.channel` enum already allows it).
3. Checks `isConversationUnlocked(kv, conversationId)`; if unlocked, loads the
   sensitive KB and passes it to `answer()`.
4. Appends the user turn, awaits the **full** response text from `answer()`'s
   stream (`await result.text`), appends the assistant turn, returns the text.
   MCP tool results are returned whole — no streaming.

### Identification over MCP

`request_identification` → the human principal receives the verification email →
the human gives the code to the agent → `verify_identification` unlocks the
conversation in KV + DB. Subsequent `ask` calls on the same `conversationId`
include sensitive content. Identical model to the web flow; no MCP OAuth.

## Security

- The endpoint is **public** — public CV access is the goal.
- Sensitive content stays gated behind the identify flow, exactly as in chat.
- Rate limiting: reuse `checkRateLimit` (KV-backed), keyed by client IP from
  `x-forwarded-for`, with per-tool limits mirroring the HTTP routes
  (`request_identification` tighter than `ask`).
- Free-email rejection in `request_identification` is inherited from
  `requestIdentification()` (`isLikelyWorkEmail`).

## Error handling

- Tool input validation failures → MCP tool errors (`isError` content), not
  thrown exceptions.
- `lib/` function failures (e.g. `requestIdentification` returns
  `{ ok: false, reason }`, Resend failure) → mapped to descriptive tool errors.
- Malformed JSON-RPC / protocol errors → handled by the SDK transport.

## Testing

- Unit tests on the four tool handlers in `lib/mcp/tools.ts`: each verifies the
  handler calls the right `lib/` function with mapped arguments and shapes the
  success/error result correctly. `lib/` functions are stubbed/injected the same
  way Plan 2 did (in-memory KV, injected `send`, etc.).
- A light smoke test that the `McpServer` registers the expected four tools.
- The transport/protocol layer is not exhaustively unit-tested — consistent with
  Plan 2's approach to routes (validation tested, happy path smoke-tested).

## File structure

```
app/api/mcp/route.ts            # new — Streamable-HTTP route
lib/mcp/server.ts               # new — McpServer factory
lib/mcp/tools.ts                # new — four tool handlers
tests/lib/mcp/tools.test.ts     # new — handler unit tests
tests/lib/mcp/server.test.ts    # new — tool-registration smoke test
package.json                    # +@modelcontextprotocol/sdk
README.md                        # document the MCP endpoint
.env.example                     # no new vars expected
```

## Out of scope

- MCP OAuth / authorization-server flow (the email-code flow covers identity).
- Streaming tool results / progress notifications (`ask` returns whole text).
- MCP resources or prompts — tools only.
- Admin panel / CLI — Plan 4.

## Dependencies on prior work

- Plan 2's `lib/` functions and the `conversations` / `askers` /
  `questions_for_alex` tables, all shipped.

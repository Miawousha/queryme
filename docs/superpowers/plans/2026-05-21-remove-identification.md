# Remove the Identification & Sensitive-Content Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove queryme's email-code identification flow and all sensitive-content gating, so the CV agent simply answers from the public knowledge base or forwards a question to Alexandre.

**Architecture:** This is a deletion-and-simplification plan. The agent's `answer()` core, the web chat, and the MCP server lose their `sensitiveKbText` / unlock branch entirely. The MCP server drops from four tools to two (`ask`, `forward_question`). The `askers` table and the `conversations.askerId` / `conversations.sensitiveUnlockedAt` / `questionsForAlex.askerId` columns are dropped via a Drizzle migration. The `forward_question` path and the `[[forward:...]]` marker are kept untouched — they become the sole channel for "things the agent won't answer publicly."

**Tech Stack:** Next.js 15.5, React 19, TypeScript strict, Drizzle + drizzle-kit, Upstash Redis, vitest. `pnpm` is the package manager.

**Starts from:** `main` (commit `e95425c` or later).

**Conventions:**
- All paths relative to `/Users/alexandrecollet/queryme`; run commands from the repo root.
- After every task: `pnpm typecheck && pnpm test && pnpm build` must all pass. The build runs `validate:kb` first.
- This is a removal: the "test" for each task is that typecheck + the full suite + the build stay green with the deleted code and its tests gone. Do not add new tests; delete the tests that cover removed code.
- Commit after each task with the message in the final step.
- When a task says "remove X from file F", read F, delete exactly the named symbols/blocks/imports, and leave the rest intact. If removing X leaves an unused import or variable, remove that too (TypeScript strict + the build will flag it).

---

## File structure after this plan

```
queryme/
├── lib/
│   ├── identity/                  # DELETED (whole directory)
│   ├── kb/
│   │   ├── crypto.ts              # DELETED
│   │   ├── loader.ts              # Modified — no sensitive loading
│   │   └── assembler.ts           # Modified — no assembleSensitiveKbText
│   ├── answerer.ts                # Modified — no sensitiveKbText param
│   ├── db/schema.ts               # Modified — askers table + 3 columns dropped
│   ├── db/migrations/             # New migration file generated
│   ├── conversations/repo.ts      # Modified — isConversationUnlockedInDb removed
│   ├── mcp/tools.ts               # Modified — 2 handlers + schemas removed
│   └── mcp/server.ts              # Modified — 2 tools unregistered
├── app/
│   └── api/
│       ├── identify/              # DELETED (whole directory)
│       └── chat/route.ts          # Modified — no unlock / sensitive branch
├── components/
│   ├── identify-modal.tsx         # DELETED
│   ├── chat.tsx                   # Modified — no IdentifyModal
│   ├── chat-message.tsx           # Modified — no [[identify]] marker
│   └── admin/admin-dashboard.tsx  # Modified — no askers / unlocked UI
├── kb/sensitive/                  # DELETED (whole directory)
├── scripts/kb-sensitive.ts        # DELETED
├── prompts/system.md              # Modified — identify / sensitive sections removed
├── tests/                         # Matching test files deleted / trimmed
├── package.json                   # Modified — deps + scripts removed
└── .env.example / README.md       # Modified — env + docs updated
```

---

## Task 1: Remove the two identification MCP tools

The MCP server exposes four tools. Remove `request_identification` and `verify_identification`, leaving `ask` and `forward_question`.

**Files:**
- Modify: `lib/mcp/tools.ts`
- Modify: `lib/mcp/server.ts`
- Modify: `tests/lib/mcp/tools.test.ts`
- Modify: `tests/lib/mcp/server.test.ts`

- [ ] **Step 1: Trim `tests/lib/mcp/tools.test.ts`**

Delete the entire `describe("handleRequestIdentification", …)` block and the entire `describe("handleVerifyIdentification", …)` block. Delete the now-unused imports `handleRequestIdentification`, `handleVerifyIdentification`, and the types `RequestIdentificationDeps`, `VerifyIdentificationDeps` from the `@/lib/mcp/tools` import lines. Keep the `handleAsk` and `handleForwardQuestion` suites untouched.

- [ ] **Step 2: Trim `tests/lib/mcp/server.test.ts`**

The registration smoke test asserts the registered tool names. Change the expected sorted array to exactly:

```typescript
expect(names).toEqual(["ask", "forward_question"]);
```

- [ ] **Step 3: Remove the handlers and schemas from `lib/mcp/tools.ts`**

Delete: `RequestIdentificationInputSchema`, `RequestIdentificationInput`, `VerifyIdentificationInputSchema`, `VerifyIdentificationInput`, `RequestIdentificationDeps`, `RequestIdentificationResult`, `handleRequestIdentification`, `VerifyIdentificationDeps`, `VerifyIdentificationResult`, `handleVerifyIdentification`. Delete the now-unused imports `requestIdentification`, `verifyIdentification` (from `@/lib/identity/service`). Keep `AskInputSchema`, `ForwardQuestionInputSchema`, `handleAsk`, `handleForwardQuestion` and their types.

- [ ] **Step 4: Unregister the tools in `lib/mcp/server.ts`**

Delete the two `server.registerTool("request_identification", …)` and `server.registerTool("verify_identification", …)` blocks. Delete the now-unused imports: `requestIdentification`, `verifyIdentification` (from `@/lib/identity/service`), `sendVerificationCode` (from `@/lib/identity/resend`), and `handleRequestIdentification`, `handleVerifyIdentification`, `RequestIdentificationInputSchema`, `VerifyIdentificationInputSchema` (from `@/lib/mcp/tools`). Update the `McpServer` `instructions` string: remove the sentence describing `request_identification` / `verify_identification`; keep the description of `ask` and `forward_question`.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test tests/lib/mcp/
```
Expected: typecheck clean; MCP tests pass (the two identification suites gone, `ask` + `forward_question` + the 2-tool registration test green).

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/tools.ts lib/mcp/server.ts tests/lib/mcp/
git commit -m "refactor(mcp): drop the request/verify_identification tools"
```

---

## Task 2: Remove the sensitive-content branch from the agent answer path

Remove the unlock check and sensitive-KB plumbing from the chat route and the MCP `ask` handler. The agent always answers from the public KB only.

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `lib/mcp/tools.ts`
- Modify: `tests/lib/mcp/tools.test.ts`
- Modify: `tests/app/api/chat/route.test.ts`

- [ ] **Step 1: Simplify `handleAsk` in `lib/mcp/tools.ts`**

In the `AskDeps` type, remove the fields `kv`, `isConversationUnlocked`, and `loadSensitiveKbText`. Keep `db`, `getOrCreateConversation`, `appendTurn`, `loadPublicKbText`, `produceAnswer`. In `ProduceAnswerArgs`, remove the `sensitiveKbText` field. In the `handleAsk` body: remove the `unlocked` line, remove the `sensitiveKbText` line, and change the `produceAnswer` call to pass only `{ messages, kbText }`. Remove the now-unused `KvClient` import if nothing else uses it, and the `isConversationUnlocked` type import.

- [ ] **Step 2: Update the `handleAsk` tests in `tests/lib/mcp/tools.test.ts`**

In every `AskDeps` object the test builds, delete the `kv`, `isConversationUnlocked`, and `loadSensitiveKbText` properties. Delete the whole test `it("passes sensitive KB text to produceAnswer only when the conversation is unlocked", …)`. Delete the unused `MemoryKv` import if no remaining test uses it. The remaining `handleAsk` tests (conversationId generated / reused / history / empty-question) must still pass with the trimmed `AskDeps`.

- [ ] **Step 3: Simplify `app/api/chat/route.ts`**

Read the file. Remove: the `isConversationUnlocked` import and call; the `maybeGetSensitiveKbText` helper (and its module-level cache if separate); any `unlocked` variable; passing `sensitiveKbText` into `answer()`. The route keeps: rate limiting, `getOrCreateConversation`, `appendTurn`, public KB load, `answer({ messages, kbText })`, transcript persistence. If the route sets an `x-conversation-id` response header, keep it (the client still uses the conversationId for `forward_question`).

- [ ] **Step 4: Update `tests/app/api/chat/route.test.ts`**

Remove any assertions or mocks referencing unlock state or sensitive KB. The route's validation-path tests should otherwise be unchanged.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test tests/lib/mcp/ tests/app/api/chat/
```
Expected: typecheck clean; tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts lib/mcp/tools.ts tests/lib/mcp/tools.test.ts tests/app/api/chat/route.test.ts
git commit -m "refactor(agent): remove the sensitive-KB unlock branch from chat + ask"
```

---

## Task 3: Remove the identify API routes, the modal, and the `[[identify]]` marker

**Files:**
- Delete: `app/api/identify/` (whole directory: `request/route.ts`, `verify/route.ts`)
- Delete: `components/identify-modal.tsx`
- Delete: `tests/app/api/identify/` (whole directory)
- Modify: `components/chat.tsx`
- Modify: `components/chat-message.tsx`
- Modify: `tests/components/chat-message.test.tsx`

- [ ] **Step 1: Delete the routes, the modal, and their tests**

```bash
git rm -r app/api/identify components/identify-modal.tsx tests/app/api/identify
```

- [ ] **Step 2: Remove the modal from `components/chat.tsx`**

Remove: the `IdentifyModal` import; the `modalOpen` state; the `onIdentify={() => setModalOpen(true)}` prop passed to messages; the `<IdentifyModal … />` element. The chat keeps `conversationId`, `handleForward`, the `onForward` wiring, and `forwardToast`.

- [ ] **Step 3: Remove the `[[identify]]` marker from `components/chat-message.tsx`**

In `splitOnMarkers`: change the marker regex so it only matches `forward:` markers (drop the `identify` alternative) — `/\[\[(forward:[^\]]+)\]\]/g` — and remove the `MarkerChunk` `{ kind: "identify" }` variant and the branch that produces it. In the render, remove the `chunk.kind === "identify"` block and the `onIdentify` prop from `ChatMessageProps`. Keep the `forward` chunk handling and `onForward` exactly as-is.

- [ ] **Step 4: Update `tests/components/chat-message.test.tsx`**

Remove any test asserting `[[identify]]` rendering / the "Identify yourself" button. Keep the `[[forward:…]]` and markdown/citation tests.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test tests/components/
```
Expected: typecheck clean; component tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(chat): remove the identify modal, routes, and [[identify]] marker"
```

---

## Task 4: Delete `lib/identity/`

With no callers left (Tasks 1–3 removed them all), the identity service, tokens, codes, email-domain check, and Resend sender are dead code.

**Files:**
- Delete: `lib/identity/` (whole directory: `service.ts`, `tokens.ts`, `codes.ts`, `email-domain.ts`, `resend.ts`)
- Delete: `tests/lib/identity/` (whole directory)

- [ ] **Step 1: Confirm there are no remaining importers**

```bash
grep -rn "lib/identity" lib app components tests --include="*.ts" --include="*.tsx"
```
Expected: no output. If anything prints, it is a missed reference from Tasks 1–3 — fix that file first.

- [ ] **Step 2: Delete the directories**

```bash
git rm -r lib/identity tests/lib/identity
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm test
```
Expected: typecheck clean; full suite passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete lib/identity (no remaining callers)"
```

---

## Task 5: Remove the sensitive-KB machinery

Remove encrypted-KB loading, assembly, the `answer()` sensitive param, the `kb/sensitive/` content, the fixture, and the encryption script.

**Files:**
- Delete: `lib/kb/crypto.ts`, `tests/lib/kb/crypto.test.ts`
- Delete: `kb/sensitive/` (whole directory)
- Delete: `scripts/kb-sensitive.ts`
- Delete: `tests/fixtures/kb/sensitive/` (whole directory)
- Modify: `lib/kb/loader.ts`, `lib/kb/assembler.ts`, `lib/answerer.ts`
- Modify: `tests/lib/kb/loader.test.ts`, `tests/lib/kb/assembler.test.ts`, `tests/lib/answerer.test.ts`

- [ ] **Step 1: Remove sensitive loading from `lib/kb/loader.ts`**

Read the file. Remove: the `SensitiveKb` type, the `sensitive` field from the `Kb` type, `loadSensitiveKb` / `readOptionalSensitiveYaml` (and any sensitive schema imports), and any `crypto` import. `loadKb` returns only the public KB (profile, skills, education, public-contact, experience, projects). Remove sensitive schema entries from `lib/kb/schemas.ts` if they live there and are now unused.

- [ ] **Step 2: Remove `assembleSensitiveKbText` from `lib/kb/assembler.ts`**

Delete the `assembleSensitiveKbText` function and its `SensitiveKb` import. Keep `assemblePublicKbText` and its renderers unchanged.

- [ ] **Step 3: Remove the sensitive param from `lib/answerer.ts`**

Read the file. Remove the `sensitiveKbText` parameter from `answer()`'s input type and every use of it (the prompt assembly should use only `kbText`). If `answer()` placed `sensitiveKbText` in a separate prompt-cache breakpoint, collapse to the single public-KB breakpoint.

- [ ] **Step 4: Delete the files and directories**

```bash
git rm lib/kb/crypto.ts tests/lib/kb/crypto.test.ts scripts/kb-sensitive.ts
git rm -r kb/sensitive tests/fixtures/kb/sensitive
```

- [ ] **Step 5: Trim the KB tests**

In `tests/lib/kb/loader.test.ts` and `tests/lib/kb/assembler.test.ts`: delete every test that loads or asserts sensitive content (`assembleSensitiveKbText`, `kb.sensitive`, salary/references/private-contact). In `tests/lib/answerer.test.ts`: delete tests passing `sensitiveKbText`; keep the public-KB tests. In `lib/kb/citations.ts` the `CITATION_RE` still allows `.yaml.enc` — leave the regex as-is (harmless; no `.enc` files remain) OR drop the `\.enc` alternative for tidiness; if dropped, update `tests/lib/kb/citations.test.ts` accordingly.

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all green. `pnpm build` runs `validate:kb` — confirm `scripts/validate-kb.ts` does not reference `kb/sensitive`; if it does, remove that part.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(kb): remove encrypted sensitive-KB loading, assembly, and content"
```

---

## Task 6: Drop the `askers` table and identity columns from the schema

The `askers` table and the `conversations.askerId`, `conversations.sensitiveUnlockedAt`, and `questionsForAlex.askerId` columns are no longer written or read after Tasks 1–5. Drop them with a Drizzle migration.

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/conversations/repo.ts`
- Modify: `lib/admin/data.ts`
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `lib/questions/repo.ts` (only if it reads/writes `askerId`)
- Create: a generated migration under `lib/db/migrations/`

- [ ] **Step 1: Edit `lib/db/schema.ts`**

Delete the entire `askers` table definition and the `Asker` / `NewAsker` exported types. In `conversations`, delete the `askerId` and `sensitiveUnlockedAt` columns. In `questionsForAlex`, delete the `askerId` column. Keep `conversations.transcript`, `channel`, `language`, `startedAt`, `lastMessageAt`, and the `questionsForAlex` `question` / `answeredAt` / `createdAt` columns.

- [ ] **Step 2: Remove `isConversationUnlockedInDb` from `lib/conversations/repo.ts`**

Delete that function (it reads `sensitiveUnlockedAt`). Verify with `grep -rn "isConversationUnlockedInDb" lib app` that nothing imports it.

- [ ] **Step 3: Update `lib/admin/data.ts`**

Remove the `askers` query and the `askersById` map. Remove `Asker` from the imports and the `AdminData` / `AdminStats` types. From `AdminStats` remove `askers` and `unlocked`. The dashboard data becomes: `stats` (conversations, chat, mcp, questions, unanswered), `conversations`, `questions`. Remove the `sensitiveUnlockedAt` reference in the `unlocked` stat.

- [ ] **Step 4: Update `components/admin/admin-dashboard.tsx`**

Remove the "Identified askers" `Section` and the `AskerRow` component. Remove the `asker` lookups passed to `ConversationRow` / `QuestionRow` (those rows show "Anonymous" only — simplify them to drop the `asker` prop and always render without an asker name, or render the conversation/question without that line). Remove the `unlocked` stat card and the `sensitiveUnlockedAt` "unlocked" badge in `ConversationRow`. Remove the `Asker` type import. The dashboard keeps: stat cards (conversations, chat/mcp, questions), the conversations section with transcripts, the forwarded-questions section.

- [ ] **Step 5: Update `lib/questions/repo.ts` if needed**

```bash
grep -n "askerId" lib/questions/repo.ts
```
If `forwardQuestion` inserts `askerId`, remove that field from the insert. If nothing prints, no change.

- [ ] **Step 6: Generate the migration**

```bash
pnpm db:generate
```
Expected: drizzle-kit writes a new migration SQL file under `lib/db/migrations/` dropping the `askers` table and the three columns. Inspect the generated SQL — confirm it drops `askers`, `conversations.asker_id`, `conversations.sensitive_unlocked_at`, `questions_for_alex.asker_id` and nothing else.

- [ ] **Step 7: Verify**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(db): drop the askers table and sensitive/identity columns"
```

> **Deployment note (not a code step):** the generated migration must be applied to the production database with `pnpm db:migrate` after this change is deployed. Flag this in the PR / handoff.

---

## Task 7: Remove dependencies, env vars, prompt sections, and docs

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `prompts/system.md`
- Modify: `lib/prompts.ts` (only if it references sensitive content)
- Modify: `lib/language.ts` (only if it has identify-related UI strings)
- Modify: `README.md`

- [ ] **Step 1: Remove dependencies and scripts from `package.json`**

```bash
pnpm remove resend @react-email/components @react-email/render
```
Then delete the `kb:gen-key`, `kb:encrypt`, and `kb:decrypt` script entries from the `scripts` block (the `scripts/kb-sensitive.ts` file was deleted in Task 5). Keep `validate:kb`, `db:generate`, `db:migrate`.

- [ ] **Step 2: Remove env vars from `.env.example`**

Delete the `KB_SENSITIVE_KEY` block, the `RESEND_API_KEY` line, the `RESEND_FROM_EMAIL` line, and the `APP_NAME` / `APP_PUBLIC_URL` lines if they were used only by the verification email. Verify with `grep -rn "APP_NAME\|APP_PUBLIC_URL\|RESEND\|KB_SENSITIVE_KEY" lib app scripts` — if a name still has a live reference, keep that one.

- [ ] **Step 3: Edit `prompts/system.md`**

Delete the `## Sensitive content access` section entirely. In the `## When you don't know` section, delete the `[[identify]]` marker description (item 2) and its example line; keep the `[[forward:<question text>]]` marker (item 1) and its example. Renumber if needed. The agent's instruction is now: answer from the KB, or use `[[forward:…]]`.

- [ ] **Step 4: Check `lib/prompts.ts`**

```bash
grep -n "sensitive\|Sensitive\|identif" lib/prompts.ts
```
If it injects a "Sensitive knowledge base" section or unlock language into the assembled prompt, remove that branch so the prompt only ever contains the public KB. If nothing prints, no change. Update `tests/lib/prompts.test.ts` to match if it changed.

- [ ] **Step 5: Check `lib/language.ts`**

```bash
grep -n "identif\|Identif\|sensitive\|Sensitive\|unlock" lib/language.ts
```
If there are identify-related UI strings (modal labels etc.), remove them from both `en` and `fr`. If nothing prints, no change.

- [ ] **Step 6: Update `README.md`**

Remove or rewrite any section describing the identification flow, sensitive content, the email-code verification, `KB_SENSITIVE_KEY`, the `kb:*` scripts, and Resend. In the MCP section, change the tools table to the two remaining tools (`ask`, `forward_question`) and delete the "Accessing sensitive content" subsection. Ensure the described behavior matches: public CV agent, answers from the KB or forwards a question.

- [ ] **Step 7: Verify**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all green. `pnpm build` runs `validate:kb` successfully with no `kb/sensitive`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove identification deps, env vars, prompt sections, and docs"
```

---

## Plan complete

End state: queryme is a public CV agent with no identification flow and no sensitive-content gating. The web chat and the MCP server (`ask`, `forward_question` only) answer from the public knowledge base; anything the agent won't answer publicly is forwarded to Alexandre via the existing `[[forward:…]]` / `forward_question` path. The `askers` table and identity columns are dropped (migration generated, to be applied on deploy). `lib/identity/`, `lib/kb/crypto.ts`, `kb/sensitive/`, the identify routes, the modal, and the Resend dependency are gone. All tests, typecheck, and the production build pass.

**Follow-up plans (separate, not in scope here):** (2) security hardening — trusted client-IP for rate limits, rate-limit MCP `forward_question`; (3) admin write loop — mark-answered/reply/delete + forward notifications; (4) observability + resilience; (5) polish — CI, lint, SEO, KB enrichment, docs.

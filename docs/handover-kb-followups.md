# Handover — KB living-outline follow-ups: anchored citations, polish batch, descopes, history rehydration

**Date:** 2026-06-11
**For:** a fresh session executing this work. Assume no memory of the conversation that produced this file. Read [`docs/handover-kb-living-outline.md`](handover-kb-living-outline.md) first for the feature's code map and invariants.
**Repos:** app at `/Users/alexandrecollet/queryme` (github.com/Miawousha/queryme), content repo at `/Users/alexandrecollet/queryme-content-alex` (github.com/Miawousha/queryme-content-alex).
**Scope:** items 2–5 of the previous handover, expanded into actionable work. Work in order — A is the highest-value/lowest-risk, D is the largest.

---

## A. Teach the agent to cite anchors (content repo)

**Problem (observed live):** asked "What did he build at ION Energy?", the agent cited `[^kb:experience/2018-ion-energy.md]` five times and never used an anchor — so tree chips land on doc nodes instead of lighting up sections. The app handles anchors end-to-end; the prompt under-asks for them.

**Where:** content repo `prompts/system.md`, "## Citations" section (~line 46). Current wording documents both forms but expresses no preference. The app repo's `tests/fixtures/persona/prompts/system.md` mirrors it for tests — do NOT edit the fixture (it pins app behavior independently of content).

**Change:** rewrite the citation rules to prefer anchors. Suggested wording (adapt to the file's voice):

> - Prefer the section form `[^kb:<path>#<anchor>]` whenever a specific section of the document supports the claim — the anchor is the kebab-case slug of that section's `##`/`###` heading (e.g. `## Scale and traction` → `#scale-and-traction`). Use the whole-file form `[^kb:<path>]` only for claims about the document as a whole.
> - When you cite the same document for different points, cite the specific section each time rather than repeating the whole-file reference.

French headings slugify with accents kept (`## Rôle` → `#rôle`); the app matches anchors loosely (case/underscores/dots tolerated) and degrades unmatched anchors to doc-level chips, so the change is zero-risk to rendering.

**Steps:**
1. Edit `prompts/system.md` in the content repo; commit + push there.
2. Sync into the app: admin → Settings → Content source (or the admin CLI — `pnpm admin --help` lists the account/link commands). Sync clears the KB caches.
3. Validate: ask 2–3 section-specific questions on `/Miawousha` and confirm chips land on section nodes (expand the cited doc). Run `pnpm evals` in the app repo and compare citation quality; `evals/run.ts` parses citations from answers.

## B. Polish batch (app repo — six small items, one commit each)

All are reviewer-flagged observations from the feature's review loops. None are bugs in the "broken" sense; pick them off in any order. Test gate for each: `pnpm vitest run tests/lib/kb/` (or `tests/`) + `pnpm typecheck`.

1. **Counts show pre-filter totals.** A filtered collection can read `8` while displaying 1 doc. Fix in `lib/kb/tree.ts`: recount `count` during `prune` (count surviving doc descendants) instead of only at build time. Update `tests/lib/kb/tree.test.ts` — the existing "counts docs per container" test covers the unfiltered case; add a filtered-case expectation.
2. **Back-from-viewer re-pulses the last cited node.** The auto-reveal dedup set is a `useRef` in `components/kb/use-kb-tree-state.ts` (`seen`), which resets when `KbTree` unmounts (opening a doc swaps the panel to the viewer). Lift the set into `KbContext` (a ref in the provider survives the swap; reload resets it together with `citedRefs`, which is correct).
3. **`notInKb` dead-end.** `components/kb/kb-panel.tsx` (~line 79): when `openTarget` points at a path missing from the manifest, the message renders with no way back. Add a band with the existing back affordance (see how `KbDocToolbar` renders `‹ {backLabel}`) that calls `closeFile()`.
4. **Outline dropdown ARIA.** `components/kb/kb-doc-toolbar.tsx` `OutlineTitle` uses `role="menu"`/`menuitem` without arrow-key focus management. Either add roving focus (ArrowUp/Down move, Home/End, focus first item on open) or drop to a plain popover listbox. Escape-close and blur-close already exist.
5. **Streaming numbering window.** In `components/chat.tsx`, `citationIndices` derives from `citedRefs` (context state set by an effect), so a brand-new citation's superscript can show a per-message fallback number for one frame. Derive the map directly: `useMemo` over the same `assistantMessages` via `extractCitations`, keeping `setCitedRefs` for the panel. Closes the window entirely.
6. **Mobile double-mount.** `components/kb/kb-layout.tsx` keeps the hidden desktop pane mounted below the `sm` breakpoint, so with the drawer open the panel (and an open doc's text fetch) runs twice. Gate the desktop pane on a `matchMedia("(min-width: 640px)")` hook instead of CSS-only hiding. Mind SSR (no `window`) — render nothing until the media query resolves, or default to desktop.

## C. Descopes menu (design-first; confirm scope with Alexandre before building)

The v1 spec (`docs/superpowers/specs/2026-06-10-kb-living-outline-design.md` §Out of scope) deliberately deferred these. Recommended order:

1. **Bidirectional navigation (recommended first — the data is already there).** Clicking a citation chip in the tree scrolls the chat to the citing message; `CitedRef.messageId` is captured for exactly this. **Design wrinkle to resolve before coding:** tree chips currently render as `<span class="kb-chip">` INSIDE the row `<button>` — interactive descendants of a button are invalid HTML/ARIA, so the chip can't simply become a button. Options: (a) make the chip a sibling element outside the row button (layout change), (b) keep chips display-only in the tree and make the VIEWER's heading chips (`kb-viewer.tsx` `mdComponents` — not inside buttons) the clickable ones, (c) hover popover on the row with a "show in chat" action. Chat side needs message anchors: in `components/chat.tsx`, wrap each message with `id={`msg-${m.id}`}` and scroll via the chat pane's own container (NOT `document.getElementById` — the layout mounts panes twice; see the scoped-query pattern in `kb-viewer.tsx` `jumpTo`). Use the brainstorming skill for the chip-affordance decision; it's a UX call.
2. **Conversation-trail view.** A chronological "what the agent has cited" list (per-message grouping) as a third lens state or a separate toggle. Builds directly on `citedRefs` (already ordered, with `messageId`). Moderate.
3. **YAML key outlining.** Top-level YAML keys as section nodes. Requires a yaml-aware `extractSections` equivalent AND viewer-side anchors — the viewer renders yaml as one `<pre>` block (`kb-viewer.tsx`), which has no heading ids, so the viewer rendering must change too. Medium effort; questionable payoff while yaml files are small.
4. **User pins/annotations (session-scoped).** Largest item; needs its own brainstorm + spec. Don't start without explicit demand.
5. **Virtualization: do NOT build.** Irrelevant below ~1000 visible rows; the current KB renders ~50. Revisit only if a real KB exceeds that with everything expanded.

## D. Conversation history rehydration (independent of KB work)

**Current behavior:** `queritae:conversationId` persists in localStorage and is sent with each request (`components/chat.tsx`), but `useChat` starts empty on reload — the visitor loses the visible thread (and the KB tree loses its chips, since `citedRefs` derive from messages).

**Good news:** transcripts are already stored server-side — `conversations.transcript` jsonb (`ConversationTurn[] = { role, text, at }`) in `lib/db/schema.ts`, appended by `lib/chat/handle-chat.ts` via `lib/conversations/repo.ts` (`getOrCreateConversation`, `appendTurn`). No storage work needed.

**Shape of the work:**
1. New endpoint `GET /api/a/[username]/chat/history?conversationId=<uuid>` returning the transcript turns, scoped to the account (`conversations.accountId` must match the resolved account — return 404 otherwise, and 404 for unknown ids). The UUID acts as an unguessable bearer token, same trust model as the existing flow; never list conversations, only exact-id lookup. Cap response size (transcripts are bounded by `MAX_TURNS` per request but grow per conversation).
2. Client: on mount with a stored `conversationId`, fetch history and seed `useChat` (AI SDK v5: `messages`/initial messages option on the transport or `useChat({ messages })` — check `@ai-sdk/react` docs for the exact prop in the installed version). Map `ConversationTurn` → UI message parts (`{ type: "text", text }`); synthesize stable ids (e.g. `hist-<index>`) — `extractCitations` only needs ids to be distinct.
3. The KB chips then rehydrate for free (the extraction effect runs over the seeded messages). Decide one UX detail: suppress the auto-reveal pulse for seeded history (the `seen` set from item B2 makes this trivial — pre-populate it before the first effect run, or accept one initial reveal as "re-orientation").
4. Edge cases: conversation expired/deleted → fall back to a fresh conversation (clear the stored id); language mismatch (conversation language is sticky server-side — keep the stored conversation's language or start fresh on mismatch).
5. Tests: endpoint scoping (account mismatch → 404, unknown id → 404, happy path) following `tests/lib/kb/handlers.test.ts` patterns; a unit test for the turn→message mapping.

## Working agreements (from the previous session)

- Use the superpowers flow: brainstorm only where flagged (C1, and D's UX detail), TDD for lib changes, subagent-driven execution worked well.
- Invariants: slug parity lives only in `lib/kb/slug.ts`; tree and viewer must stay locale-consistent; don't reintroduce `requestAnimationFrame` for scroll/jump logic (dead in hidden tabs).
- Dev gotchas: never run `pnpm build` while `next dev` serves the same dir (corrupts `.next`); clean up `.claude/worktrees/` before trusting full-suite test counts from the repo root; dev server config is `.claude/launch.json` (`queritae-dev`, port 3001), test page `/Miawousha`.
- Repo habits: docs-only commits go straight to `main`; feature work gets a worktree + branch; spec/plan docs under `docs/superpowers/`.

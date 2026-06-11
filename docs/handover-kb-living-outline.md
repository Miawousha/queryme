# Handover — KB living-outline browser: follow-ups

**Date:** 2026-06-11
**For:** a fresh session picking this up. Assume no memory of the conversation that produced this file.
**Repos:** app at `/Users/alexandrecollet/queryme` (github.com/Miawousha/queryme), content repo at `/Users/alexandrecollet/queryme-content-alex` (github.com/Miawousha/queryme-content-alex).

---

## TL;DR

The chat-page KB panel is now a hierarchical "living outline" tree (merged + pushed to `main` 2026-06-11, merge `f9192e2`): collections → folders → docs → h2/h3 sections, with citation chips `[n]` pinned on the exact sections the agent cited, numbered identically to the chat superscripts. A "Referenced · n" lens prunes the tree to cited branches; the filter highlights matches; the viewer scrolls/flashes anchors and carries a breadcrumb + outline dropdown. Fully bilingual (FR sidecars drive tree labels, section slugs, and viewer bodies consistently).

**Nothing is broken or half-done** — 539 tests, typecheck, prod build all green; live-verified in the browser (both layouts, both locales, real chat round-trip). Everything below is improvement, not repair.

Authoritative docs: spec at [`docs/superpowers/specs/2026-06-10-kb-living-outline-design.md`](superpowers/specs/2026-06-10-kb-living-outline-design.md), plan (with per-task detail) at [`docs/superpowers/plans/2026-06-10-kb-living-outline.md`](superpowers/plans/2026-06-10-kb-living-outline.md).

## Code map

| Concern | Where |
|---|---|
| Pure tree derivation (grouping, chips, dots, filter/lens pruning) | `lib/kb/tree.ts` (+ `tests/lib/kb/tree.test.ts`) |
| Shared slugger — server manifest, client heading ids, anchor matching MUST agree | `lib/kb/slug.ts` |
| h2/h3 extraction (fence-aware, GitHub dup suffixes) | `lib/kb/sections.ts` |
| Manifest with `sections`, locale-resolved (`loadKbManifest(dir, lang)`) | `lib/kb/manifest.ts` |
| Lang-aware endpoint + `(account, lang)` LRU | `lib/kb/handlers.ts`, `lib/kb/cache.ts`, `app/api/a/[username]/kb/route.ts` |
| Citation pairs with global indices | `lib/kb/cited-paths.ts` (`extractCitations`, `CitedRef`, `citedRefKey`) |
| Tree UI + expansion/lens/auto-reveal state | `components/kb/kb-tree.tsx`, `components/kb/use-kb-tree-state.ts` |
| Panel (swap tree ↔ viewer, breadcrumb, scroll restore) | `components/kb/kb-panel.tsx` |
| Viewer (anchor jump/flash, cited markers, outline dropdown) | `components/kb/kb-viewer.tsx`, `components/kb/kb-doc-toolbar.tsx` |
| Chat numbering + `kb://path#anchor` sentinel | `components/chat.tsx`, `components/chat-message.tsx` |

Session state keys: `queritae:kbTree:<apiBasePath>` (expansion overrides), `queritae:kbTreeScroll:<apiBasePath>` (tree scroll).

Dev loop: `pnpm test`, `pnpm typecheck`, dev server via `.claude/launch.json` (`queritae-dev`, port 3001), account page `/Miawousha` (ROOT_ACCOUNT_USERNAME in `.env.local`).

## Next steps, prioritized

### 1. Smoke-check the production deploy (5 min)

`f9192e2` was pushed 2026-06-11; if Vercel auto-deploys `main`, verify on production: tree renders with collections/counts, a citation chip appears after a chat answer, clicking a superscript opens the doc, FR switch localizes section titles. No code expected — just eyes.

### 2. Make the agent actually cite anchors (content repo — biggest UX win)

During live verification the model answered a detailed question citing `[^kb:experience/2018-ion-energy.md]` five times — never an anchor — so chips landed at doc level, not on sections. The app handles anchors end-to-end; the prompt doesn't push the model to use them. In the **content repo's** `prompts/system.md` (Citations section, ~line 46), strengthen the instruction: prefer `[^kb:<path>#<anchor>]` whenever a specific section supports the claim, citing the kebab-case slug of that section's heading; whole-file cites only for document-wide claims. Then sync via admin → Content and check answer quality with `pnpm evals`. Note the matching is forgiving (`normalizeAnchor` in `lib/kb/slug.ts`), and unmatched anchors degrade to doc-level chips — so a stronger prompt is zero-risk to rendering.

### 3. Small polish items (each ≤1h, all reviewer-flagged observations, none load-bearing)

- **Counts are pre-filter totals**: a filtered collection can show `8` while displaying 1 doc. Recount during `prune` in `lib/kb/tree.ts` if it bothers anyone.
- **Back-from-viewer re-pulses the last cited node**: the auto-reveal `seen` set lives in `use-kb-tree-state.ts` and resets when the tree unmounts (viewer open). Lift it to KbContext or sessionStorage to pulse only truly-new citations.
- **`notInKb` dead-end**: citing a path missing from the manifest shows the message with no Back control (`kb-panel.tsx:79`) — pre-existing, now more reachable.
- **Outline dropdown ARIA**: `role="menu"` without arrow-key focus management (`kb-doc-toolbar.tsx`). Either add roving focus or downgrade to a plain listbox/popover pattern.
- **Streaming numbering window**: a brand-new citation's superscript can render a per-message fallback number for ~1 frame before `citedRefs` round-trips through context. Deriving `citationIndices` directly from `messages` in `chat.tsx` closes it.
- **Mobile double-mount**: `kb-layout.tsx` renders the panel twice (hidden desktop pane + drawer), so an open doc fetches its text twice. Conditional mount on the `sm` breakpoint would halve the work.

### 4. Deliberate v1 descopes (spec §Out of scope — pick up only if wanted)

- Bidirectional navigation: clicking a tree chip scrolls the chat to the citing message (`CitedRef.messageId` is already captured for this).
- Conversation-trail view (chronological list of refs), user pins/annotations, YAML key outlining, virtualized rendering (irrelevant below ~1000 rows).

### 5. Unrelated but observed during verification

- Conversation history does not rehydrate on page reload — `queritae:conversationId` persists in localStorage but `useChat` starts empty. If reload-persistence is wanted it's a chat-transport feature, independent of the KB work.

## Gotchas for the next session

- **Slug parity is the invariant.** Any change to heading→slug logic must go through `lib/kb/slug.ts` (used by manifest extraction, viewer heading ids, and anchor matching). Divergence silently breaks chips/jumps; `tests/lib/kb/slug.test.ts` + `tree.test.ts` guard it.
- **Locale consistency is the second invariant.** The tree (manifest `?lang=`) and the viewer body (`/kb/file?lang=`) must resolve the same sidecar; this was the one integration bug found in final review.
- `requestAnimationFrame` is intentionally avoided for the anchor jump (`kb-viewer.tsx`) — rAF never fires in hidden tabs. Don't "modernize" it back.
- The `.next` dev cache corrupts if `pnpm build` runs while `next dev` serves the same dir — symptom is a 500 `Cannot find module './vendor-chunks/...'`; fix is stop server, `rm -rf .next`, restart.
- Worktrees under `.claude/worktrees/` get picked up by vitest when running from the repo root — clean them up before trusting full-suite numbers.

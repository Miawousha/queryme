# Handover — update the content repo (`Miawousha/queryme-content-alex`) for content.config.yaml

**Date:** 2026-06-10
**For:** a fresh session picking this up. Assume no memory of the conversation that produced this file.
**Repos:** app at `/Users/alexandrecollet/queryme` (github.com/Miawousha/queryme), content repo at `/Users/alexandrecollet/queryme-content-alex` (github.com/Miawousha/queryme-content-alex).

---

## TL;DR

The app's KB engine is no longer hardwired to a resume (merged to `main` 2026-06-10, commits `4fd1594..09aaecc`). A content repo may now ship a **`content.config.yaml`** at its root declaring its own collections; without one, the legacy **resume preset** applies and behavior is byte-identical to before (the assembled agent prompt is prompt-cache-stable — this is test-pinned in the app repo).

**The content repo requires NO changes to keep working.** This handover is for *adopting* the new config — do it when the owner wants custom collections (notes, glossary, writing, whatever), reordering, renamed sections, or to relax the bilingual requirement.

Authoritative reference: [`docs/content-repo-guide.md`](content-repo-guide.md) — see §2 and the new section **"Custom collections (`content.config.yaml`) — optional"**. The implementation lives in `lib/kb/content-config.ts` (config schema + resume preset), `lib/kb/loader.ts` (engine), `lib/kb/assembler.ts` (prompt rendering).

## Current state of the content repo

`queryme-content-alex` is a standard resume-preset repo (no `content.config.yaml`):

- 4 core YAML pairs (`profile`, `skills`, `education`, `public-contact`, each `en` + `.fr`)
- `kb/experience/` (5 entries ×2 langs), `kb/projects/` (14 entries ×2 langs, repos nested in front-matter), `kb/talks/` + `kb/recommendations/` (empty, `.gitkeep`)
- `persona.yaml`, `prompts/system.md`, `cv-config.yaml`
- Linked to the `Miawousha` account; synced via admin → Settings → Content source (or `pnpm admin account link`).

## Step 0 — the identity config (safe starting point)

This config reproduces the current repo EXACTLY (same prompt bytes, same sync requirements). Start from it, then edit:

```yaml
# content.config.yaml — identity config for the resume preset
locales: [en, fr]
collections:
  - name: profile
    kind: yaml
    schema: profile
    required: true
  - name: skills
    kind: yaml
    schema: skills
    required: true
  - name: education
    kind: yaml
    schema: education
    required: true
  - name: public-contact
    kind: yaml
    schema: public-contact
    required: true
  - name: experience
    kind: markdown
    schema: experience
  - name: projects
    kind: markdown
    schema: project       # preset schema names are SINGULAR: project, talk, recommendation
  - name: talks
    kind: markdown
    schema: talk
  - name: recommendations
    kind: markdown
    schema: recommendation
```

From there, typical edits:
- **Add a custom collection** (markdown dir or single yaml file):
  ```yaml
  - name: notes
    kind: markdown
    label: { en: Notes, fr: Notes }      # KB-panel group heading (and prompt section heading)
    sort: { field: date, order: desc }   # generic collections default to filename order
  ```
  Then create `kb/notes/<slug>.md` files (front-matter is free-form for `generic`; entry titles come from `title` → `name` → humanized slug; quote dates as strings, e.g. `date: "2026-01"`).
- **Drop a section** you don't use (e.g. delete the `talks` entry — the dir can stay, it's just ignored).
- **Go English-only**: `locales: [en]` — the `.fr.yaml` siblings stop being required by the sync gate (existing `.fr` files are harmless; they're only read when serving French).
- **Reorder**: collection order = section order in the agent prompt AND group order in the KB panel.

## Rules the gate/engine enforce (will fail sync or validation if violated)

- `profile` and `public-contact` must exist as yaml collections with those exact names and schemas; they're treated as `required: true` no matter what the config says.
- `locales[0]` must be `"en"` (bare filenames are English), locales unique. Only `en`/`fr` exist today.
- `required: true` is yaml-only (markdown dirs may be absent/empty by design).
- Collection names: kebab-case `[a-z0-9-]`, **`other` is reserved** (panel catch-all), max 64 collections.
- A malformed `content.config.yaml` **rejects the sync** (previous good content stays live); the error names the file.
- Declaring a config **replaces the preset entirely** — list every collection you keep. Omitted = gone from prompt, panel, and CV.

## Gotchas that are easy to miss

- **CV coupling:** the printable CV and `cv-config.yaml` read the resume projection, which matches by collection NAME + schema (`experience`/`projects`/`talks` + `skills`/`education`). Rename `projects` → `portfolio` and the CV's projects section goes empty (the chat agent still sees it fine). Keep resume names if the CV matters.
- **Citations are file paths:** `[^kb:projects/spritz.md]` etc. Renaming directories/files changes citation paths and `cv-config.yaml` slugs.
- **`prompts/system.md` is still the brain:** if you add a `notes` collection, consider a line in the system prompt telling the agent what notes are and how to use them. The config declares structure only.
- The sync gate checks file *existence* (+ config validity); schema validation of YAML/front-matter happens at load time and `validate:kb` — run validation before pushing.

## Workflow (agent-first, non-interactive)

```bash
# 1. Edit in the content repo
cd /Users/alexandrecollet/queryme-content-alex
# ... create/edit content.config.yaml, kb files ...

# 2. Validate from the app repo (loads config + every schema + assembles the prompt)
cd /Users/alexandrecollet/queryme
PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb
# Expect: "OK — KB validates and assembles to N chars." + one line per collection.

# 3. Optional live preview against local content
PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm dev

# 4. Ship
cd /Users/alexandrecollet/queryme-content-alex
git add -A && git commit -m "..." && git push

# 5. Resync (either)
#    admin UI: /{username}/admin → Settings → Content source → Resync
#    CLI:      cd /Users/alexandrecollet/queryme && pnpm admin account link Miawousha https://github.com/Miawousha/queryme-content-alex
```

## Definition of done

- [ ] `pnpm validate:kb` passes against the local checkout and prints the expected collections.
- [ ] If the config is the identity config: assembled char count unchanged vs before (validate:kb prints it).
- [ ] Pushed to `main` of the content repo; Resync succeeded (status badge OK in admin, no error in Sync history).
- [ ] Spot-check `/{username}`: KB panel shows the expected groups; ask the agent a question grounded in any new collection and confirm it cites `[^kb:<path>]` correctly (citation opens in the viewer).

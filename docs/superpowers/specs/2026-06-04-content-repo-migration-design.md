# Migrate the Miawousha content repo to repos-under-projects

**Date:** 2026-06-04
**Status:** Draft (pending review)
**Target repo:** `/Users/alexandrecollet/queryme-content-alex` (public: `github.com/Miawousha/queryme`)
**Depends on:** the app-side `code → projects` merge (already merged to `main` in the queryme app repo).

## Problem

The app now models repos as a `repos:` array nested under projects; the standalone
`kb/code/` category is gone. The Miawousha content repo still uses the old layout:
**51 repos** in `kb/code/*.md` (+ 51 translated `kb/code/*.fr.md` sidecars), a
`kb/code/index.yaml` tag registry, one existing `projects/queryme` project, and a
`cv-config.yaml` with `code:` + `chat.featured_code`. Once the new app goes live,
syncing this repo would silently drop all 51 repos (the loader ignores `kb/code/`)
and the strict `cv-config` schema would reject the `code`/`chat` keys.

This migration restructures the content repo to the new ontology — losslessly and
bilingually — grouping the 51 repos into a curated set of projects.

## Decisions (from brainstorming)

1. **Shape:** hybrid — flagship single-repo projects + a few multi-repo projects.
2. **Battery/energy → one product project:** "Altergo Battery Intelligence Platform".
3. **Keep all 51 repos** (private ones stay in the KB; they're hidden from the
   printable CV but remain in the agent's knowledge, as today).
4. **Preserve every repo's rich write-up.** Single-repo projects: the repo body
   becomes the project body. Multi-repo projects: the project body is a short intro
   plus one `## <Repo>` section per repo carrying its full narrative. Nothing is lost.
5. **Bilingual:** every project gets `<slug>.md` (EN) + `<slug>.fr.md` (FR), built
   from the repos' EN and FR sources respectively.
6. **`queryme` is merged**, not recreated: the `queryme` repo joins the existing
   `projects/queryme.md` + `queryme.fr.md` (keep their hand-written narrative).

## The taxonomy (14 projects, all 51 repos)

Slugs are kebab-case filenames; "Name" is the project `name:` front-matter.

### Single-repo projects (repo body → project body)
| slug | Name | repo |
|---|---|---|
| queryme *(exists — merge)* | Queryme | queryme |
| ontoloom | Ontoloom | ontoloom |
| polypress | Polypress | polypress |
| learn-anything | Learn Anything | learn-anything |
| feedsnap | Feedsnap | feedsnap |
| travelbook | Travelbook | travelbook |
| matrice-website | Matrice Website | matrice-website |
| string-theory | String Theory | string-theory |
| grammairept | GrammairePT | grammairept |
| exit-velocity | Exit Velocity | exit-velocity |

### Multi-repo projects (project body = intro + `## <Repo>` per repo)
| slug | Name | repos |
|---|---|---|
| spritz | Spritz | spritz, spritz-modern, spritz-svelte |
| personal-tools | Personal tools | toudoux, sirene, roadmap |
| altergo-battery-intelligence-platform | Altergo Battery Intelligence Platform | aging-battery-lifetime-simulator, altergo-platform-etl-benchmark, altergo-strategic-docs, arbitrage, battery-capacity-sizer, battery-digital-twin-models, battery-usage-analyzer, bess-control-sim, cell-imbalance, cell-model-visualizer, cellsos, demo-eq-cycle-model, effective-capacity-benchmark-model, hppc-analysis, hydrogen, impedance, model-boilerplate, rtbm, rtbm-clone, rtbm-dataset-generator, simple-soc-model, soc, soc-model, sop, supplier-data-mapping, tsdb-benchmark |
| dev-tooling-experiments | Dev tooling & experiments | blueprint-creator, blueprints-importer, simple-app, openclaw-config, opus-infra, su2re, article-checker, bisque, saas |

Counts: single-repo = 10 repos; spritz = 3; personal-tools = 3; altergo = 26;
dev-tooling = 9 → **51 repos total** (verified against the 51 canonical `code/*.md`).

## Per-repo entry (the `repos:` array)

Each repo becomes one `repos:` item carrying its existing front-matter fields:
`name, url, role, visibility, description, year, last_active, language, stars,
archived, stack, tags` — **`code_bytes` is dropped** (removed from the schema).
Tags carry over as free-form (the `code/index.yaml` registry is deleted; no
validation). The EN project's repo `description` comes from `code/<repo>.md`; the
FR project's from `code/<repo>.fr.md`.

## Project files produced

For each project, write `kb/projects/<slug>.md` and `kb/projects/<slug>.fr.md`:

- **Front-matter:** `name` (table above), `repos:` (the array), plus derived:
  - single-repo: `year`, `stack`, `tags`, `url` copied from the repo (public repos only for `url`).
  - multi-repo: `year` = max repo year; `tags` = a small curated set (Altergo → `[battery, energy]`; Dev tooling → `[tooling]`; Spritz → `[productivity]`; Personal tools → `[productivity]`); omit `stack`/`url` (the repos carry their own).
- **Body (EN in `.md`, FR in `.fr.md`):**
  - single-repo: the repo's body verbatim (EN body in `.md`, FR body in `.fr.md`).
  - multi-repo: a **short 1–3 sentence intro** (drafted EN + FR — Altergo gets a real platform intro; the others a concise lead-in), followed by `## <Repo Name>` + that repo's body, one section per repo, in the taxonomy's listed order.
- **`queryme` (merge):** do NOT overwrite `projects/queryme.md`/`.fr.md`. Append the
  `queryme` repo to their existing `repos:` (create the key if absent); leave the
  existing narrative untouched.

## Content-repo side effects (same migration)

1. **Delete `kb/code/` entirely** — all 51 `.md` + 51 `.fr.md` + `index.yaml` — only
   after every repo is written into a project (lossless gate).
2. **`cv-config.yaml`:** remove the `code:` section and the `chat:` block
   (`featured_code`). Keep `experience`, `projects`, `education`, `skills`, `talks`.
   Set `projects:` to `all: true` (14 projects now; the old value may reference stale
   slugs) unless a curated order is wanted.
3. **`prompts/system.md`:** remove any `lookup_code_entries` / `# Code (index)`
   instructions and `[ref: code/<slug>.md]` references — that tool no longer exists.
   Grep and clean (mirrors what was done to the fixture system.md app-side).

## Tooling

The generic `scripts/migrate-code-to-projects.ts` (in the app repo) is **English-only
and would delete the French sidecars** — insufficient here. Enhance it to be
**bilingual + plan-driven + body-composing**, then drive it with a hand-authored plan
(this taxonomy), rather than the auto tag-grouping:

- **Plan input:** accept a hand-authored `_migration-plan.yaml` listing each project's
  `slug`, `name`, `repos: [...]`, optional `tags`, optional `intro_en` / `intro_fr`,
  and a `merge: true` flag (for `queryme`). The auto `proposePlan` stays as a fallback
  for non-curated repos but is not used here.
- **Bilingual read:** for each repo slug, read both `code/<slug>.md` and
  `code/<slug>.fr.md` (front-matter + body); if a `.fr.md` is missing, fall back to EN.
- **Body composition:** single-repo → repo body as project body; multi-repo →
  `intro` + `## <name>\n\n<body>` per repo (EN and FR variants).
- **Merge mode:** when a target project file already exists, append repos to its
  `repos:` and leave its body untouched.
- **Field mapping:** carry all repo fields except `code_bytes`.
- **Losslessness:** assert `repos_written_en == 51` and `repos_written_fr == 51`
  (FR counted against available `.fr.md`); refuse to `rm kb/code/` unless every
  canonical repo was written into a project in both languages. Abort before deleting
  on any shortfall (the existing abort-before-delete test pattern extends to this).

## Validation & review

- `PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm validate:kb` (from the app repo)
  must pass and report `projects: 14 entries (51 repos)`.
- Manually review the full `git diff` in the content repo (new project files, deleted
  `kb/code/`, cv-config, system.md) before committing.
- **Do not push** the content repo until the user approves the diff; pushing + Resync
  is the moment the live page changes (coordinate with deploying the app).

## Out of scope

- Re-translating or rewriting repo narratives (bodies carry over as-is).
- Changing which repos are public/private.
- Deploying the app or syncing the live page (separate, user-gated step).

## Risks

- **Body composition makes the Altergo project body large** (~26 × ~2.5k chars). This
  matches today's total prompt content (just reorganized) and is acceptable; the agent
  keeps full depth.
- **Multi-repo intros are new persona prose** — drafted during migration, reviewed by
  the user in the diff before commit.
- The migration mutates a *separate* repo; all work happens on a branch in
  `queryme-content-alex`, reviewable and revertible, nothing pushed without approval.

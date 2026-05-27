# GitHub Repos → KB Import

## Problem

The KB has a single `open-source/queryme.md` entry. Alexandre has dozens of repos on GitHub (public + private, owned + contributed-to) that aren't represented, so the chat answers shallow questions about "what has Alex built?" with almost nothing. We need a way to surface that body of work in the KB without hand-writing each entry.

## Scope

In scope:
- Owned repos under `Miawousha` — both public and private
- Public repos Alex has contributed to (merged PRs)
- One-paragraph (3–5 sentence) summary per repo
- French sidecar stubs

Out of scope:
- Private repos Alex *contributed* to but doesn't own — those overlap with `kb/experience/` entries and double-counting that work is a footgun
- Forks (unless Alex has authored substantial commits — handled by the PR-contribution path, not the fork path)
- Per-repo deep-dive pages — flagship repos can be hand-extended later, the import only seeds one-paragraph summaries
- Auto-translation of French sidecars — script copies the English body as a stub; translation is a separate manual pass (same workflow as the rest of the KB)

## Schema

Replace `OpenSourceFrontmatterSchema` in `lib/kb/schemas.ts` with `RepoFrontmatterSchema`:

```ts
export const RepoFrontmatterSchema = z.object({
  name: z.string().min(1),
  url: z.url().optional(),                            // optional: private repos may omit
  role: z.enum(["author", "maintainer", "contributor"]),
  visibility: z.enum(["public", "private"]).default("public"),
  description: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  language: z.string().optional(),                    // primary GitHub language
  stars: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type RepoFrontmatter = z.infer<typeof RepoFrontmatterSchema>;
```

Re-export under the old `OpenSourceFrontmatterSchema` name is **not** needed — we'll update every call site instead (no back-compat layer per project conventions).

## Folder

Rename `kb/open-source/` → `kb/code/`. Move existing `queryme.md` and `queryme.fr.md` over. Update:
- `lib/kb/loader.ts` — folder reference
- `lib/kb/manifest.ts` — section key
- Grep for any other literal `"open-source"` (chat tools, sitemap, assembler, citations, UI labels)

The section label shown to users in chat/UI changes from "Open Source" to "Code" (or "Repositories" — decide during implementation by checking what reads best in context).

## Import script

Path: `scripts/import-github-repos.ts`. Run with `pnpm tsx scripts/import-github-repos.ts`.

### Data fetched (via `gh` CLI, already authenticated)

**Owned repos:**
```
gh repo list Miawousha --limit 500 \
  --json name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,pushedAt,createdAt
```
Exclude forks (`isFork: true`) from this path. If Alex authored substantial work in a fork, it surfaces via the PR-contribution path instead. Keep both public and private non-forks.

**Contributed-to (public only):**
```
gh search prs --author Miawousha --state merged --limit 500 \
  --json repository
```
Dedupe by repo. Exclude any repo owned by Miawousha (already covered above). Exclude private repos (out of scope).

**README first paragraph (best-effort, public only):**
```
gh api repos/{owner}/{name}/readme --jq '.content' | base64 -d
```
Take the first non-heading paragraph. Strip badges/HTML. If unavailable or empty, fall back to the GitHub `description` field.

For private repos, skip README fetch (avoid leaking content into a script that may log) — use `description` only and flag for manual sanitization.

### Output

For each repo, write `kb/code/<slug>.md` where `<slug>` is the kebab-cased repo name.

**Idempotency**: if the file already exists, skip it. The script never overwrites. A `--force` flag rewrites everything (used only when iterating on the template).

**Template (public):**
```markdown
---
name: <repo name>
url: <url>
role: author          # author for owned, contributor for PR-based
visibility: public
description: <github description>
year: <year of createdAt>
language: <primaryLanguage.name>
stars: <stargazerCount>
archived: <isArchived>
stack: []             # left for manual fill — language ≠ stack
tags: <repositoryTopics>
---

<First README paragraph, cleaned. Falls back to description if missing.>
```

**Template (private):** same frontmatter with `visibility: private`, no `url`, and:
```markdown
<!-- TODO: sanitize — auto-imported from private repo, review before commit -->

<github description, or "No description available.">
```

The TODO comment is a load-bearing review gate. The script prints a summary at the end: `Wrote N entries (M public, K private — K need sanitization)`.

**French sidecar**: for each new `<slug>.md`, also write `<slug>.fr.md` with the same content. Translation is a manual second pass.

### Error handling

- `gh` CLI not authenticated → exit with clear message pointing to `gh auth login`
- Single repo fetch fails → log and skip, don't abort the whole run
- README parse fails → fall back to description, log as warning

## Testing

- Unit test the slug + frontmatter generator against fixture repo JSON (no network)
- Unit test the README paragraph extractor against fixture markdown (heading skip, badge strip, empty fallback)
- Schema test that `RepoFrontmatterSchema` accepts the generated frontmatter for both public and private templates
- Idempotency test: running the script twice on the same input produces no changes on the second run

No end-to-end test that hits the real GitHub API — the script is operator-run, not CI-run.

## Migration

1. Add new schema + folder; keep old `open-source/` alongside temporarily
2. Update loader/manifest/grep call sites to point at `code/`
3. Move `queryme.md` + `queryme.fr.md` to `code/`, update their frontmatter to add `visibility: public` (and drop nothing — the old schema's fields are a subset)
4. Delete empty `open-source/` folder
5. Run the import script — review private entries, sanitize, commit
6. Translate French sidecars in a follow-up pass

All in one PR — the schema/folder change and the first import together, so review can see the end state.

## Open call during implementation

The user-facing section label ("Open Source" → ?). Candidates: "Code", "Repositories", "Projects" (already taken), "Open source & code". Pick during implementation by trying each in the chat UI.

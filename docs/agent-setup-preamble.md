# Queritae KB setup — agent instructions

You are a coding agent setting up a **Queritae content repo** for your user.
Queritae serves a queryable CV: visitors chat with an agent whose only
knowledge is the content repo you are about to build. The repo holds the
user's knowledge base (KB), system prompt, and persona config — plain YAML
and Markdown files in a **public** GitHub repo.

Everything after this preamble is the complete schema reference for that
repo. Follow this workflow:

## Workflow

1. **Gather source material.** Ask the user for whatever they have: a
   CV/resume (PDF or text), a LinkedIn export, a personal site or portfolio
   URL, project READMEs. Read all of it before writing anything.
2. **Scaffold the repo.** Create a new local git repo with the layout from
   "Repo layout" in the reference. The default config requires English AND
   French variants of the four core YAML files. Required: `persona.yaml`,
   `prompts/system.md`, `kb/profile.yaml`, `kb/skills.yaml`,
   `kb/education.yaml`, `kb/public-contact.yaml`, plus the `.fr.yaml`
   sibling of each of those four `kb/` files. If the user doesn't want
   French content, copy each English file to its `.fr.yaml` sibling. (The
   alternative — a `content.config.yaml` with `locales: [en]` — REPLACES
   the default config entirely; read "Custom collections" in the reference
   before using it.)
3. **Fill the KB.** Convert the source material into the schemas in the
   reference. Then interview the user — a few targeted questions at a
   time — to fill gaps and capture what a CV can't: stories, highlights,
   and context for `kb/experience/*.md` and `kb/projects/*.md`. Write in
   the user's voice; don't pad and don't invent anything.
4. **Self-check before pushing.** Re-read every file you wrote against the
   schema reference (field names, date formats, slug conventions, required
   front-matter). The sync runs the full schema validation — every YAML
   file and Markdown front-matter block, in every declared locale, plus
   `persona.yaml` — so a schema mistake fails the sync with a descriptive
   error instead of breaking the user's live page. The self-check saves
   you round-trips through that repair loop. (The "Validate locally"
   section in the reference needs a Queritae checkout; skip it unless you
   have one.)
5. **Publish.** Create a **public** GitHub repo (private repos cannot be
   synced — the fetch is unauthenticated), push, and give the user the
   repo URL.
6. **Hand off.** Tell the user to paste the repo URL in their Queritae
   admin — **Settings → Content source**, then **Sync** (see "Connect it to
   Queritae" in the reference). If the sync reports an error, have the
   user paste it back to you; fix the file, push, and ask them to sync
   again.

---

# Building Your Content Repo (Knowledge Base)

This guide walks you through building the **content repo** that powers your
queryme page — the public GitHub repository that holds everything the agent
knows and says about you: your identity, your system prompt, and your knowledge
base (KB).

queryme itself is a generic shell. It doesn't ship with your content baked in —
it loads it at runtime from a GitHub repo you point it at. Editing your page is
just: **edit a file → commit → push → click Resync.** No app code, no redeploy.

> **TL;DR:** Create a public GitHub repo with `persona.yaml`,
> `prompts/system.md`, and a `kb/` folder (profile, skills, education,
> public-contact — each in English **and** French), validate it with
> `pnpm validate:kb`, then connect it from your admin at
> **`/{username}/admin` → Settings → Content source**.

---

## 1. The big picture

```
your content repo (public GitHub)          queryme app
┌───────────────────────────┐              ┌──────────────────────┐
│ persona.yaml              │   Sync       │  fetches the repo     │
│ prompts/system.md         │ ───────────► │  tarball, validates,  │
│ cv-config.yaml (optional) │              │  caches, serves it    │
│ kb/ … your knowledge base │              │  at /{username}       │
└───────────────────────────┘              └──────────────────────┘
        edit → commit → push  ──────────── click "Resync" ─────────►
```

- The repo must be **public** (queryme fetches it unauthenticated).
- A sync always pulls the **latest commit of the configured branch** (default
  `main`).
- The agent answers in the **third person about you** ("Jordan worked at…"),
  grounded only in your KB, and cites its sources.

---

## 2. Repo layout

```
persona.yaml                         # who the persona is (identity + pronouns)   [required]
prompts/system.md                    # the agent's instructions (plain Markdown)  [required]
cv-config.yaml                       # curation for the printable CV + chat       [optional]
kb/
  profile.yaml        + profile.fr.yaml          [required, both languages]
  public-contact.yaml + public-contact.fr.yaml   [required, both languages]
  skills.yaml         + skills.fr.yaml           [required, both languages]
  education.yaml      + education.fr.yaml         [required, both languages]
  experience/<slug>.md   (+ <slug>.fr.md)        [optional, any number]
  projects/<slug>.md     (+ <slug>.fr.md)        [optional]
  talks/<slug>.md        (+ <slug>.fr.md)        [optional]
  code/<slug>.md         (+ <slug>.fr.md)        [optional]
  code/index.yaml                                [optional: tag registry for code/]
  recommendations/<slug>.md (+ <slug>.fr.md)     [optional]
```

### Required vs optional

A sync is **rejected with a clear error** unless all of these exist:

- `persona.yaml`
- `prompts/system.md`
- `kb/profile.yaml` **and** `kb/profile.fr.yaml`
- `kb/public-contact.yaml` **and** `kb/public-contact.fr.yaml`
- `kb/skills.yaml` **and** `kb/skills.fr.yaml`
- `kb/education.yaml` **and** `kb/education.fr.yaml`

Everything else is optional. The folders `experience/`, `projects/`, `talks/`,
`code/`, and `recommendations/` may be empty or absent — a persona doesn't need
entries in every category. The Markdown `.fr.md` sidecars are also optional
(see [Localization](#9-localization)).

> **Why French is required:** queryme ships English and French UI out of the
> box, and the four core YAML files back UI strings in both languages, so both
> variants must be present. If you only have English content, the simplest path
> today is to copy each `*.yaml` to `*.fr.yaml` and translate later.

---

## 3. `persona.yaml` — identity & pronouns

Small by design. It only carries what the UI shell renders that isn't already in
the KB — the persona's name and the pronouns used in UI strings (e.g. "How do I
contact **him**?").

```yaml
id: jordan-rivera                 # kebab-case, stable identifier
fullName: "Jordan Rivera"
givenName: "Jordan"
defaultLocale: en                 # en | fr
i18n:
  en:
    possessive: "their"           # "their most recent role"
    objectPronoun: "them"         # "contact them"
    subjectPronoun: "they"        # "they will see it"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "de Jordan"   # FR-only liaison form, e.g. "projets de Jordan"
```

- Validated with Zod. Unknown locales and missing required fields are rejected.
- `givenWithApostrophe` is **French-only** (the liaison form used in phrases like
  "les projets d'Alexandre" → here "de Jordan").

---

## 4. `prompts/system.md` — the agent's instructions

Plain Markdown, read **verbatim** — there is no templating or `{{placeholder}}`
substitution. Write your name and pronouns as literal text. At runtime queryme
appends your assembled knowledge base to the end of this file under a
`## Knowledge base` heading, so your prompt should reference it as the
authoritative source.

Your prompt should establish, at minimum:

- **Voice & language.** Third person about the persona; detect and mirror the
  asker's language (English / French supported).
- **Grounding policy.** The KB is the only source of truth; gentle inference is
  allowed but must be flagged ("likely", "probably"); never invent facts.
- **Citations (mandatory).** Every KB-based factual claim must be followed by a
  citation token (see [§10](#10-citations--how-the-kb-feeds-the-agent)):
  - `[^kb:<path>]` — whole file, e.g. `[^kb:experience/2022-acme.md]`
  - `[^kb:<path>#<anchor>]` — a section (anchor = kebab-case of the heading)
- **The forward marker.** `[[forward:<question text>]]` renders a "forward this
  question to {you}" button — use sparingly, only when you could meaningfully
  follow up.
- **The `identify_interviewer` tool.** Record who the agent is talking to (name,
  company, role, contact) when a visitor volunteers it; pass the complete
  picture each call; set `basis` to `stated` or `inferred`.
- **The `lookup_code_entries` tool.** If you ship a `# Code (index)` section
  (long-tail repos, see [cv-config](#8-cv-configyaml--curation--featured-code)),
  the agent fetches full repo bodies on demand by their `[ref: code/<slug>.md]`
  paths.

A trimmed skeleton to start from:

```markdown
# System prompt — {Your Name}'s agent

You are the public AI agent for {Your Name}. You answer questions from visitors
(recruiters, hiring managers, and agents acting for them) about {Your Name}'s
professional background, experience, projects, skills, and how to reach {pronoun}.

## Voice and language
- Speak in the **third person** about {Your Name}.
- Detect the asker's language and reply in it. You support **English** and
  **French**; otherwise reply in English and note the supported languages.
- Tone: warm, concise, professional. No emojis, no marketing fluff.

## Grounding policy
- The "Knowledge base" section below is the only source of truth. Don't invent
  employers, dates, titles, metrics, certifications, or contact details.
- You may infer gently, but flag it ("likely", "based on adjacent experience…").

## When you don't know
- Emit `[[forward:<question>]]` only when the question is something {Your Name}
  could meaningfully answer later. Otherwise say so plainly and point to a
  related public fact.

## Identifying who you're talking to
- Call `identify_interviewer` when a visitor reveals their name, company, role,
  the role they're hiring for, or contact details. Pass the complete picture each
  time; set `basis` to `stated` or `inferred`. Don't interrogate.

## Citations
- Follow every KB-based claim with `[^kb:<path>]` (or `[^kb:<path>#<anchor>]`).
- Citations are mandatory for dates, titles, company/project names, technologies,
  and metrics.

## Knowledge base
The complete public knowledge base follows. Treat each `# <Section>` heading as
authoritative; the `[ref: <path>]` markers tell you which file to cite.

---
```

(For a complete, real-world example, see `tests/fixtures/persona/prompts/system.md`
in the queryme repo.)

---

## 5. The four core KB files (YAML)

These are structured facts. Each is validated by a Zod schema
(`lib/kb/schemas.ts`) — a malformed file fails the sync with a precise message.

### `kb/profile.yaml`

```yaml
name: Jordan Rivera
headline: Staff Software Engineer — distributed systems, from kernel to cloud
location: Berlin, Germany          # optional
languages: [en, fr]                # optional; subset of en | fr
photo: https://…/jordan.jpg        # optional
links:                             # optional; all entries are URLs
  linkedin: https://www.linkedin.com/in/jordanrivera/
  github: https://github.com/jordanrivera
  website: https://jordanrivera.dev
  twitter: https://x.com/jordanrivera
```

Required: `name`, `headline`. Everything else is optional.

### `kb/skills.yaml`

```yaml
skills:
  - name: Distributed systems
    level: 5                 # integer 1–5 (self-rated)
    years: 12                # number ≥ 0
    tags: [backend, expert]  # optional
  - name: TypeScript / Next.js
    level: 4
    years: 8
    tags: [frontend, software]
```

### `kb/education.yaml`

```yaml
entries:
  - institution: "TU Berlin"
    degree: "M.Sc. Computer Science"
    start: "2011-09"         # YYYY-MM, YYYY-MM-DD, or "present"
    end: "2013-07"
    notes: "Thesis on consensus protocols."   # optional
```

### `kb/public-contact.yaml`

```yaml
email: jordan@example.com    # optional
links:                       # optional; same shape as profile.links
  linkedin: https://www.linkedin.com/in/jordanrivera/
  github: https://github.com/jordanrivera
```

Each of these four needs a French sibling (`profile.fr.yaml`, etc.) for the sync
to pass.

---

## 6. Narrative entries (Markdown + front-matter)

Folders under `kb/` hold one Markdown file per item. Each file has a YAML
**front-matter** block (between `---` fences) with structured facts, followed by
a free Markdown **body** with the narrative. The filename (without `.md`) is the
entry's **slug** and is what citations and `cv-config` reference.

### `kb/experience/<slug>.md` (e.g. `2022-acme.md`)

```markdown
---
company: Acme Corp
role: Principal Engineer
start: "2022-03"            # YYYY-MM | YYYY-MM-DD | present
end: present
location: Remote            # optional
summary: "Led the platform team rebuilding Acme's billing core."  # optional, 1 line
highlights:                 # optional; up to 8 bullets, ≤280 chars each — used on the printable CV
  - "Cut p99 checkout latency 70% by resharding the ledger."
  - "Grew the platform team from 4 to 16 engineers."
stack: [Go, Postgres, Kafka, Kubernetes]   # optional
tags: [backend, platform, leadership]      # optional
---

## Context
Acme processes ~2M transactions/day…

## What we built
- …

## Highlights
- …
```

`company`, `role`, `start`, `end` are required. Entries sort newest-first by
`start` (`present` sorts to the top).

### `kb/projects/<slug>.md`

```markdown
---
name: openpipe
year: 2024            # optional integer
stack: [Rust, WASM]   # optional
tags: [tooling]       # optional
url: https://github.com/jordanrivera/openpipe   # optional
---

A streaming data pipeline that…
```

### `kb/talks/<slug>.md`

```markdown
---
title: "Consensus without tears"
venue: "QCon London"
year: 2023            # required integer
location: "London, UK"   # optional
url: https://…           # optional
tags: [distributed-systems]   # optional
---

Abstract and notes…
```

### `kb/recommendations/<slug>.md`

```markdown
---
from: "Dana Lee"
title: "VP Engineering, Acme Corp"
date: "2024-02"       # YYYY-MM (required)
relationship: "Managed Jordan directly"   # optional
url: https://www.linkedin.com/in/…/        # optional
---

"Jordan is the rare engineer who…"
```

### `kb/code/<slug>.md` + `kb/code/index.yaml`

Repo entries describe codebases you've authored or contributed to. (These are
often generated by queryme's GitHub import, but you can hand-write them.)

```markdown
---
name: openpipe
url: https://github.com/jordanrivera/openpipe
role: author                 # author | maintainer | contributor
visibility: public           # public | private (default: public)
description: "Streaming data pipeline in Rust."   # optional, one line
year: 2024                   # optional
last_active: "2025-05"       # optional, YYYY-MM
language: Rust               # optional
stars: 240                   # optional
archived: false              # optional
stack: [Rust, WASM]          # optional
tags: [tooling, rust]        # optional — must exist in code/index.yaml#tags (if that registry is non-empty)
---

Narrative about the project…
```

`kb/code/index.yaml` is an optional **tag registry** plus bulk assignments:

```yaml
tags:                      # the allowed tag vocabulary (slug: description)
  ai: AI / ML / LLM systems
  rust: Rust
  tooling: Developer tooling
assignments:               # fill tags for repos whose front-matter omits `tags:`
  openpipe: [rust, tooling]
```

Rules: a repo's own front-matter `tags:` wins; otherwise `assignments[slug]` is
used. If the registry (`tags:`) is **non-empty**, any tag not in it is a hard
error (catches typos). Leave the registry empty to allow any tag while you ramp
up.

---

## 7. Dates, slugs & front-matter conventions

- **Dates:** `YYYY-MM`, `YYYY-MM-DD`, or the literal `present` (for `start`/`end`
  on experience). `recommendations.date` and `code.last_active` are `YYYY-MM`.
- **Slugs:** the filename minus `.md`. Prefix with a year for natural sorting and
  stable citations, e.g. `2022-acme.md`. Slugs are referenced by `cv-config.yaml`
  and appear in citation tokens — renaming a file changes its citation path.
- **Front-matter:** standard YAML between `---` fences; the rest of the file is
  Markdown. Quote values that contain `:`ings or special characters.

---

## 8. `cv-config.yaml` — curation & featured code

Optional. Controls what appears (and in what order) on the printable `/cv`, and
which repos the chat agent pre-loads. Omit the file entirely to show everything.

```yaml
# Per CV section: omit key → show all (default); `all: true` → show all
# explicitly; `include: [...]` → whitelist, order preserved.
experience:
  include:                 # identifiers are file slugs (basename, no .md)
    - 2022-acme
    - 2018-startup
education:
  all: true
skills:
  all: true                # identifier = skill.name (case-insensitive)
projects:
  all: true
talks:
  all: true
code:
  all: true

# Chat-agent curation. `featured_code` is the curated set pre-loaded into the
# system prompt under "# Code (featured)". Remaining repos render as one-line
# stubs under "# Code (index)" and are fetched on demand via the
# `lookup_code_entries` tool. Omit/empty → every repo is inlined.
chat:
  featured_code:
    - openpipe
    - my-flagship-project
```

Identifier reference: experience/projects/talks/code → **file slug**; skills →
**skill name** (case-insensitive); education → **institution** (case-insensitive).
Unknown identifiers are warned, not fatal.

---

## 9. Localization

queryme is bilingual (English + French). For any file, add a sibling with a
language code before the extension:

- `kb/profile.yaml` → `kb/profile.fr.yaml`
- `kb/experience/2022-acme.md` → `kb/experience/2022-acme.fr.md`

The loader serves the localized variant when present and **falls back to the
canonical English file** when it's missing. Citations always reference the
canonical path, so citation tokens stay stable across languages.

- The four core YAML files (`profile`, `public-contact`, `skills`, `education`)
  **require both** `en` and `fr` — the sync checks for the `.fr.yaml` files.
- Markdown `.fr.md` sidecars are **optional** — English is used as the fallback.

---

## 10. Citations & how the KB feeds the agent

At request time queryme assembles your entire KB into one text block and appends
it to `prompts/system.md` under `## Knowledge base`. Each entry is introduced by
a `[ref: <path>]` marker telling the agent which path to cite. The agent must
then cite that path in its answers:

- `[^kb:profile.yaml]`, `[^kb:experience/2022-acme.md]`
- `[^kb:experience/2022-acme.md#highlights]` (section anchor = kebab-case heading)

In the UI, clicking a citation opens that file in the in-app viewer, and the
knowledge-base side panel surfaces cited files to the top. Two special agent
markers are rendered specially:

- `[[forward:<question>]]` → a "forward this question to you" button (the question
  lands in your admin's **Questions** queue).
- The `identify_interviewer` tool result → a chip on the conversation showing
  exactly what was captured (visible in your admin's **Conversations**).

For large code collections, `featured_code` repos are inlined while the rest
become stubs the agent pulls on demand via `lookup_code_entries`.

---

## 11. Validate locally before you sync

Point queryme's validator at a local checkout of your repo. It loads `kb/`,
runs every schema, and assembles the KB — failing loudly on the first problem:

```bash
# from a queryme checkout, with your content repo checked out next to it:
PERSONA_LOCAL_OVERRIDE=../your-content-repo pnpm validate:kb
```

Expected output:

```
OK — KB validates and assembles to 48213 chars.
  experience:      6 entries
  projects:        4 entries
  …
```

> `validate:kb` checks the `kb/` tree (schemas + assembly). The **sync** does an
> additional check that all [required files](#required-vs-optional) exist
> (including `persona.yaml`, `prompts/system.md`, and the `.fr.yaml` variants)
> and validates `persona.yaml`. Running both gives you full coverage.

You can also run your repo against your own copy by setting
`PERSONA_LOCAL_OVERRIDE` and starting `pnpm dev` to preview the live page.

---

## 12. Connect it to queryme

Once your repo is on public GitHub:

### Option A — from the admin UI (recommended)

1. Sign in and open your admin at **`/{username}/admin`**.
2. Go to **Settings → Content source**.
3. Paste your repo URL (`https://github.com/<owner>/<repo>`) and the branch
   (defaults to `main`), then click **Sync**.
4. queryme fetches the latest commit, validates, and goes live. The active
   commit, last-synced time, and a status badge appear; failures show the error
   inline, and the **Sync history** lists past attempts.

### Option B — from the CLI (agent-friendly)

```bash
pnpm admin account link <username> <https://github.com/owner/repo>
```

(The same machinery; handy for scripting or first-time setup.)

---

## 13. Update workflow

Editing your page is a normal git loop:

1. Edit a YAML or Markdown file in your content repo.
2. `git commit` and `git push`.
3. In **Settings → Content source**, click **Resync from current source**
   (or Sync again). The agent serves the new content on the next request.

There is no redeploy and no app code change — the shell never moves.

---

## 14. Troubleshooting (common sync errors)

| Error | Cause & fix |
|---|---|
| `missing required file(s): …` | A [required file](#required-vs-optional) is absent — often a `.fr.yaml` sibling. Add it (copy the English one to start). |
| `schema validation failed for <file>` | A field is wrong/missing/mistyped. The message names the file and field. Check types: `level` is an integer 1–5, dates match `YYYY-MM`, `links.*` are URLs. |
| `frontmatter validation failed for <entry>` | A Markdown file's front-matter is invalid (e.g. experience missing `company`/`role`/`start`/`end`, talk missing `year`). |
| `kb/code/<slug>: unknown tag(s) …` | A `code/*.md` tag isn't in `kb/code/index.yaml#tags`. Add it to the registry or remove the tag. |
| Sync rejected — not a GitHub URL | Only `https://github.com/<owner>/<repo>` is accepted (no SSH URLs, no deep paths). |
| Repo can't be fetched | The repo must be **public**. Private repos aren't supported for content sync. |
| Changes don't appear | Did you push? Sync pulls the **latest commit of the configured branch** — confirm your commit is on that branch, then Resync. |

A failed sync never breaks your live page: the previously-synced content stays
active and the error is recorded in Sync history.

---

## 15. Quickstart checklist

- [ ] Create a **public** GitHub repo.
- [ ] Add `persona.yaml` (id, names, locale, pronouns for `en` + `fr`).
- [ ] Add `prompts/system.md` (voice, grounding, citations, markers, tools).
- [ ] Add the four core KB files **in both languages**: `profile`,
      `public-contact`, `skills`, `education` (`.yaml` + `.fr.yaml`).
- [ ] Add narrative entries you have: `kb/experience/*.md`, `projects/`, `talks/`,
      `code/` (+ `code/index.yaml`), `recommendations/`.
- [ ] (Optional) Add `cv-config.yaml` to curate the printable CV + featured code.
- [ ] Validate: `PERSONA_LOCAL_OVERRIDE=../your-repo pnpm validate:kb`.
- [ ] Commit, push.
- [ ] Connect at **`/{username}/admin` → Settings → Content source** → Sync.

For a complete working example, browse `tests/fixtures/persona/` in the queryme
repository — it's a minimal, valid content tree.
```

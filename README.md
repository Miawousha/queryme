# Queryme

A queryable CV. The knowledge base about Alexandre Collet, the system prompt that drives the agent, and the code that serves both are all in this repo — nothing hidden, nothing puffed up.

Live: _coming soon_

## How it works

1. The KB lives in `/kb` as YAML files (structured facts) and Markdown files (narrative stories). One file per role and per project.
2. The system prompt lives in `/prompts/system.md`. It's plain Markdown — read it.
3. The Next.js app loads the KB at runtime, assembles it into a single text blob, and injects it into the system prompt with Anthropic prompt caching so every request after the first is cheap.
4. The web chat at `/` calls `/api/chat`, which calls a shared `answer()` function. (An MCP server interface is on the way and will call the same `answer()`.)

## Local development

Prereqs: Node 20+, pnpm, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Editing the knowledge base

The KB is just files. Edit them and commit; the agent picks up the new content on the next build.

- `kb/profile.yaml` — name, headline, location, links
- `kb/skills.yaml` — skills with self-rated level (1–5) and years
- `kb/education.yaml` — schools / degrees
- `kb/public-contact.yaml` — public email + links
- `kb/experience/*.md` — one file per role. Frontmatter has structured facts; body has narrative ("What we do", "Highlights", "Stories").
- `kb/projects/*.md` — one file per project, same shape.

Validation runs at build time (via Zod schemas in `lib/kb/schemas.ts`); a malformed file fails the build with a clear message.

## Editing the agent's behavior

Open `prompts/system.md`. Edit. Commit. The build picks it up. The point of having this in the public repo is that anyone can audit exactly how the agent is instructed.

## Testing

```bash
pnpm test          # unit tests
pnpm typecheck     # TS only
pnpm build         # full Next.js build (runs KB validation first)
```

## Deployment

Push to a Vercel project linked to this repo. Set `ANTHROPIC_API_KEY` and (optionally) override `NEXT_PUBLIC_REPO_URL` / `NEXT_PUBLIC_REPO_BRANCH` if you've forked.

## What's NOT in this version

This is the foundation. Coming in later releases:

- Sensitive content (salary, references, private contact) behind verified-email identification
- Lead capture + admin panel
- MCP server endpoint for AI agents

## License

MIT.

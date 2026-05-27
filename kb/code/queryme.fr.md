---
name: queryme
url: https://github.com/Miawousha/queryme
role: author
visibility: public
description: "CV piloté par agent — répond aux questions sur Alexandre à partir d'une base de connaissances YAML/Markdown."
year: 2026
tags: [ai, agent, mcp, typescript, nextjs]
---

queryme est le système qui sert cette page. Construit avec Next.js 15, le Vercel
AI SDK, Drizzle ORM sur Neon Postgres et un serveur MCP en Streamable-HTTP pour
que d'autres agents puissent interroger Alexandre directement.

## What
La surface publique : un chat à `/` (streaming Anthropic, citations qui ouvrent
en deep-link un panneau latéral KB redimensionnable), un CV imprimable curé à
`/cv` filtré par `cv-config.yaml`, une page `/about`, et un dashboard `/admin`
protégé par mot de passe listant conversations et questions transmises. Quand un
visiteur se présente, l'agent appelle un outil `identify_interviewer` dont la
capture est affichée sous forme de chip ; les questions que l'agent ne sait pas
répondre peuvent être transmises à Alexandre via un bouton « Ask Alexandre »
inline, persistées en Postgres et envoyées par e-mail via Resend.

## Tech
La KB (`/kb/*.yaml`, `/kb/experience/*.md`, `/kb/projects/*.md`,
`/kb/code/*.md`) est validée par des schémas Zod dans `lib/kb/schemas.ts`,
assemblée en un seul blob de texte caché au boot (`lib/kb/loader.ts`,
`lib/kb/cache.ts`), et injectée dans le system prompt avec le prompt-caching
Anthropic pour que chaque requête après la première soit peu chère.
`lib/answerer.ts` est le chemin unique de réponse ; `app/api/chat/route.ts`
(streaming Vercel AI SDK) et `app/api/mcp/route.ts` l'appellent tous les deux.
La route MCP maintient une map `sessionId → transport` au-dessus de
`WebStandardStreamableHTTPServerTransport`, expose les outils `ask` et
`forward_question` (`lib/mcp/tools.ts`), et limite le débit par IP via Upstash.
Un harnais d'évals avec questions-or sous `evals/` exécute le vrai modèle contre
des assertions `mustCite` / `mustContain` / `mustNotContain` ; un
`validate-kb.ts` au build bloque les déploiements invalides. Le self-host est
livré avec un `docker-compose.yml` (drivers TCP-Postgres + Redis) ; la prod
Vercel utilise Neon en HTTP et Upstash KV.

## Status
Construit en 2026, en ligne sur queryme.matricetechnologies.com. Auteur unique ;
tout dans un seul dépôt public par design (pas de prompt caché, pas de KB
caché). 125+ fichiers KB répartis sur expérience, projets, talks,
recommandations et code. Utilisé comme CV principal d'Alexandre dans des
échanges recruteurs actifs et comme implémentation de référence du
« agent-as-CV » — la plupart des questions agentiques sur Alexandre passent par
ici, donc la qualité des entrées sous-jacentes compte plus que le polish UI.

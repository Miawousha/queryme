---
name: "ontoloom"
role: author
visibility: private
description: "Capture du savoir professionnel sous forme d'artefacts typés en markdown GitHub, indexés pour graphe et agents."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 1080329
archived: false
tags: [ai, agent, mcp, nextjs, typescript, postgres]
---

Ontoloom est une application Next.js 16 qui capture le savoir professionnel sous forme d'artefacts typés — compétences, valeurs, préférences — stockés en markdown adossé à GitHub et indexés dans Supabase avec pgvector pour la recherche sémantique. La rédaction est assistée par Anthropic Claude et les embeddings OpenAI ; les lectures sont exposées via un serveur MCP Streamable-HTTP (`mcp-handler` + OAuth) afin que des agents puissent interroger directement le graphe professionnel. Une vue graphe force-directed en React (`react-force-graph-2d`) restitue artefacts et références d'entités ; les workspaces séparent l'état entre contextes personnel et entreprise. Privé, en développement actif.

---
name: "article-checker"
role: author
visibility: private
description: "Prototype CRA de 2023 qui note l'objectivité et la consistance logique d'articles via GPT-3.5."
year: 2023
last_active: "2023-03"
language: "TypeScript"
code_bytes: 18592
archived: false
tags: [react, typescript, ai, sandbox, shelved]
---

article-checker est une esquisse Create-React-App de 2023 : on colle un article dans un textarea, l'appli l'envoie à GPT-3.5 avec un system prompt « professeur de journalisme », puis affiche la réponse JSON structurée sous forme de radar et de jauges Plotly (répartition du but, score d'objectivité, consistance logique). Construit avec React 18, react-bootstrap et le client openai appelé directement depuis le navigateur — la clé API était commitée dans le code, raison parmi d'autres pour laquelle le projet n'est jamais sorti. Abandonné.

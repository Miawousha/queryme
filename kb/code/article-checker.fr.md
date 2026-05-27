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

## What
Une page. L'utilisateur colle un texte d'article dans un textarea
(`QuestionForm`) ; `chatGPTService` appelle GPT-3.5-turbo avec un system prompt
unique embarqué dans le bundle et le schéma JSON de la réponse attendue. Le
résultat est parsé puis routé vers un `RadarChart` (but : Teach / Inform /
Persuade / Entertain / Evaluate, somme à 100 %), deux `GaugeChart` (objectivité
en %, consistance logique en %), et un `AnswerCard` listant les figures
rhétoriques et sophismes repérés. Un `cannedResponse.json` est livré pour le
travail d'UI hors-ligne.

## Tech
CRA + React 18 + react-bootstrap, `openai@3.2.1` instancié côté client. Un
`news_extractor.ts` à base de cheerio est présent mais non branché. Pas de
backend, pas d'auth. La clé OpenAI est en dur dans
`src/services/chatGPTService.ts` — quiconque a le bundle a la clé.

## Status
~3 semaines de travail le soir début 2023, abandonné en mars 2023. Jamais
déployé, jamais partagé. Tué par la clé commitée, l'absence de moat sur
« demander à GPT de noter un article », et la perte d'intérêt. Conservé comme
trace de l'idée.

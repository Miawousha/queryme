---
name: "article-checker"
role: author
visibility: private
description: "2023 CRA prototype that grades news articles for objectivity and logical consistency via GPT-3.5."
year: 2023
last_active: "2023-03"
language: "TypeScript"
code_bytes: 18592
archived: false
tags: [react, typescript, ai, sandbox, shelved]
---

article-checker is a 2023 Create-React-App sketch that pastes an article into a textarea, sends it to GPT-3.5 with a "journalism professor" system prompt, and renders the structured JSON reply as Plotly radar and gauge charts (purpose breakdown, objectivity, logical-consistency scores). Built with React 18, react-bootstrap, and the openai client called straight from the browser — API key was committed in source, which is one reason it never went anywhere. Shelved.

## What
One page. User pastes article text into a `QuestionForm` textarea; `chatGPTService`
calls GPT-3.5-turbo with a single system prompt baked into the bundle plus the
schema JSON for the expected reply. The response is parsed and routed to a
`RadarChart` (purpose: Teach / Inform / Persuade / Entertain / Evaluate, summing
to 100%), two `GaugeChart` instances (objectivity %, logical-consistency %),
and an `AnswerCard` listing flagged rhetorical devices and logical fallacies.
A `cannedResponse.json` ships for offline UI work.

## Tech
CRA + React 18 + react-bootstrap, `openai@3.2.1` instantiated client-side.
A `news_extractor.ts` using cheerio is present but unwired. No backend, no auth.
The OpenAI key sits hard-coded in `src/services/chatGPTService.ts` — anyone with
the bundle has the credential.

## Status
~3 weeks of evening work in early 2023, shelved March 2023. Never deployed,
never shared. Killed by the committed key, the lack of any moat over "ask GPT
to grade an article", and lost interest. Kept around as a record of the idea.

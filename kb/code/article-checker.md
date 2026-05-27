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

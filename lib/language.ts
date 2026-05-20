export type UiLang = "en" | "fr";

export const UI_STRINGS = {
  en: {
    headline: "Alexandre Collet — queryable CV",
    intro:
      "Hi — I'm an agent that can answer questions about Alexandre's background, experience, and projects. Ask me anything.",
    placeholder: "Ask a question…",
    send: "Send",
    startersTitle: "Try one of these",
    starters: [
      "What's his most recent role?",
      "What's his experience with AI?",
      "How do I contact him?",
    ],
    footer: {
      transparency: "Everything this agent knows is in the public repo.",
      systemPrompt: "View the system prompt",
      kb: "View the knowledge base",
      repo: "GitHub repo",
    },
  },
  fr: {
    headline: "Alexandre Collet — CV interrogeable",
    intro:
      "Bonjour — je suis un agent qui peut répondre à des questions sur le parcours, l'expérience et les projets d'Alexandre. Posez-moi vos questions.",
    placeholder: "Posez une question…",
    send: "Envoyer",
    startersTitle: "Essayez l'une de ces questions",
    starters: [
      "Quel est son poste le plus récent ?",
      "Quelle est son expérience en IA ?",
      "Comment le contacter ?",
    ],
    footer: {
      transparency: "Tout ce que cet agent sait est dans le dépôt public.",
      systemPrompt: "Voir le prompt système",
      kb: "Voir la base de connaissances",
      repo: "Dépôt GitHub",
    },
  },
} as const;

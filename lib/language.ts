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
    mcp: {
      buttonLabel: "Connect via MCP",
      title: "Connect via MCP",
      intro:
        "This CV agent is also available over the Model Context Protocol. Point any MCP client at the endpoint below using the Streamable-HTTP transport.",
      endpointLabel: "Endpoint",
      configLabel: "Client configuration",
      configNote:
        "For Claude Desktop, add this to claude_desktop_config.json. Other JSON-config clients (Cursor and similar) use the same mcpServers block.",
      toolsTitle: "Tools",
      tools: [
        {
          name: "ask",
          desc: "Ask a question about Alexandre. Returns an answer and a conversationId to reuse on follow-ups.",
        },
        {
          name: "forward_question",
          desc: "Leave a question for Alexandre to answer later.",
        },
      ],
      copy: "Copy",
      copied: "Copied",
      close: "Close",
    },
    themeToggle: "Switch between light and dark theme",
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
    mcp: {
      buttonLabel: "Se connecter via MCP",
      title: "Se connecter via MCP",
      intro:
        "Cet agent CV est aussi accessible via le Model Context Protocol. Connectez n'importe quel client MCP au point d'accès ci-dessous avec le transport Streamable-HTTP.",
      endpointLabel: "Point d'accès",
      configLabel: "Configuration du client",
      configNote:
        "Pour Claude Desktop, ajoutez ceci à claude_desktop_config.json. Les autres clients à configuration JSON (Cursor et similaires) utilisent le même bloc mcpServers.",
      toolsTitle: "Outils",
      tools: [
        {
          name: "ask",
          desc: "Poser une question sur Alexandre. Renvoie une réponse et un conversationId à réutiliser pour les questions suivantes.",
        },
        {
          name: "forward_question",
          desc: "Laisser une question à laquelle Alexandre répondra plus tard.",
        },
      ],
      copy: "Copier",
      copied: "Copié",
      close: "Fermer",
    },
    themeToggle: "Basculer entre thème clair et sombre",
  },
} as const;

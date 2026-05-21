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
          name: "request_identification",
          desc: "Email a 6-digit code to a work address to unlock sensitive content.",
        },
        {
          name: "verify_identification",
          desc: "Submit the code to unlock sensitive content for the conversation.",
        },
        {
          name: "forward_question",
          desc: "Leave a question for Alexandre to answer later.",
        },
      ],
      gateNote:
        "Public CV content needs no credentials. Sensitive details (salary, references, private contact) require the email-code identification flow — the same one used in this chat.",
      copy: "Copy",
      copied: "Copied",
      close: "Close",
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
          name: "request_identification",
          desc: "Envoyer un code à 6 chiffres à une adresse professionnelle pour débloquer le contenu sensible.",
        },
        {
          name: "verify_identification",
          desc: "Saisir le code pour débloquer le contenu sensible de la conversation.",
        },
        {
          name: "forward_question",
          desc: "Laisser une question à laquelle Alexandre répondra plus tard.",
        },
      ],
      gateNote:
        "Le contenu public du CV ne nécessite aucune authentification. Les détails sensibles (salaire, références, contact privé) requièrent le processus d'identification par code e-mail — le même que dans ce chat.",
      copy: "Copier",
      copied: "Copié",
      close: "Fermer",
    },
  },
} as const;

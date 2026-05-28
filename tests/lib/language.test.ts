import { describe, it, expect } from "vitest";
import { buildUiStrings } from "@/lib/language";
import type { Persona } from "@/lib/persona";

const ALEX: Persona = {
  id: "alex-collet",
  fullName: "Alexandre Collet",
  givenName: "Alexandre",
  defaultLocale: "en",
  i18n: {
    en: { possessive: "his", objectPronoun: "him", subjectPronoun: "he" },
    fr: {
      possessive: "son",
      objectPronoun: "le",
      subjectPronoun: "il",
      givenWithApostrophe: "d'Alexandre",
    },
  },
};

describe("buildUiStrings — byte-identity with pre-refactor literals", () => {
  it("EN headline + intro + starters + forward strings match today's literals", () => {
    const t = buildUiStrings(ALEX).en;
    expect(t.headline).toBe("Alexandre Collet — queryable CV");
    expect(t.intro).toBe(
      "Hi — I'm an agent that can answer questions about Alexandre's background, experience, and projects. Ask me anything.",
    );
    expect(t.starters).toEqual([
      "What's his most recent role?",
      "What's his experience with AI?",
      "How do I contact him?",
    ]);
    expect(t.forwardAction).toBe("Send this question to Alexandre");
    expect(t.forward.send).toBe("Send to Alexandre");
    expect(t.forward.successWithContact).toBe(
      "Sent. Alexandre will reply at the contact you left.",
    );
    expect(t.forward.successNoContact).toBe(
      "Sent. Alexandre will see it next time he checks.",
    );
    expect(t.mcp.tools[0].desc).toBe(
      "Ask a question about Alexandre. Returns an answer and a conversationId to reuse on follow-ups.",
    );
    expect(t.mcp.tools[1].desc).toBe(
      "Leave a question for Alexandre to answer later.",
    );
  });

  it("FR headline + intro + starters + forward strings match today's literals", () => {
    const t = buildUiStrings(ALEX).fr;
    expect(t.headline).toBe("Alexandre Collet — CV interrogeable");
    expect(t.intro).toBe(
      "Bonjour — je suis un agent qui peut répondre à des questions sur le parcours, l'expérience et les projets d'Alexandre. Posez-moi vos questions.",
    );
    expect(t.starters).toEqual([
      "Quel est son poste le plus récent ?",
      "Quelle est son expérience en IA ?",
      "Comment le contacter ?",
    ]);
    expect(t.forwardAction).toBe("Envoyer cette question à Alexandre");
    expect(t.forward.send).toBe("Envoyer à Alexandre");
    expect(t.forward.successWithContact).toBe(
      "Envoyé. Alexandre vous répondra au contact laissé.",
    );
    expect(t.forward.successNoContact).toBe(
      "Envoyé. Alexandre le verra lors de son prochain passage.",
    );
    expect(t.mcp.tools[0].desc).toBe(
      "Poser une question sur Alexandre. Renvoie une réponse et un conversationId à réutiliser pour les questions suivantes.",
    );
    expect(t.mcp.tools[1].desc).toBe(
      "Laisser une question à laquelle Alexandre répondra plus tard.",
    );
  });

  it("non-persona strings remain unchanged (kb panel labels)", () => {
    const t = buildUiStrings(ALEX).en;
    expect(t.kb.title).toBe("knowledge base");
    expect(t.kb.referenced).toBe("Referenced in this conversation");
    expect(t.placeholder).toBe("Ask a question…");
    expect(t.send).toBe("Send");
  });
});

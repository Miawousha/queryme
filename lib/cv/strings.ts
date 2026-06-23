import type { KbLang } from "@/lib/kb/loader";

export const CV_STRINGS = {
  en: {
    title: "Curriculum Vitae",
    print: "Print / Save as PDF",
    switchLang: "Français",
    sections: {
      achievements: "Selected achievements",
      experience: "Experience",
      education: "Education",
      skills: "Skills",
      projects: "Projects",
      talks: "Talks",
      publications: "Publications",
    },
    present: "present",
    yr: "yr",
    yrs: "yrs",
    qrAlt: "Profile QR code",
    monthFormat: "en-US" as const,
    queritae: {
      pill: "queritae",
      title: "What is Queritae?",
      pitchTemplate:
        "This is {name}'s queryable CV — a résumé you can interview. Queritae turns a GitHub repo of career notes into a grounded AI agent that answers questions, with citations.",
      bullets: [
        "Grounded in real career notes",
        "Agent-native — built-in MCP endpoint",
        "Your own domain",
      ],
      exploreCta: "Explore Queritae →",
      signupCta: "Create yours with GitHub",
      close: "Close",
    },
  },
  fr: {
    title: "Curriculum Vitae",
    print: "Imprimer / Enregistrer en PDF",
    switchLang: "English",
    sections: {
      achievements: "Réalisations clés",
      experience: "Expérience",
      education: "Formation",
      skills: "Compétences",
      projects: "Projets",
      talks: "Conférences",
      publications: "Publications",
    },
    present: "présent",
    yr: "an",
    yrs: "ans",
    qrAlt: "QR code du profil",
    monthFormat: "fr-FR" as const,
    queritae: {
      pill: "queritae",
      title: "Qu'est-ce que Queritae ?",
      pitchTemplate:
        "Voici le CV interrogeable de {name} — un CV que l'on peut interviewer. Queritae transforme un dépôt GitHub de notes de carrière en un agent IA fiable qui répond aux questions, avec citations.",
      bullets: [
        "Fondé sur de vraies notes de carrière",
        "Pensé pour les agents — endpoint MCP intégré",
        "Votre propre domaine",
      ],
      exploreCta: "Découvrir Queritae →",
      signupCta: "Créez le vôtre avec GitHub",
      close: "Fermer",
    },
  },
} as const satisfies Record<KbLang, unknown>;

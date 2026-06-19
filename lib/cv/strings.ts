import type { KbLang } from "@/lib/kb/loader";

export const CV_STRINGS = {
  en: {
    title: "Curriculum Vitae",
    print: "Print / Save as PDF",
    switchLang: "Français",
    sections: {
      experience: "Experience",
      education: "Education",
      skills: "Skills",
      projects: "Selected projects",
      talks: "Talks",
      code: "Open source",
    },
    present: "present",
    yr: "yr",
    yrs: "yrs",
    monthFormat: "en-US" as const,
  },
  fr: {
    title: "Curriculum Vitae",
    print: "Imprimer / Enregistrer en PDF",
    switchLang: "English",
    sections: {
      experience: "Expérience",
      education: "Formation",
      skills: "Compétences",
      projects: "Projets sélectionnés",
      talks: "Conférences",
      code: "Open source",
    },
    present: "présent",
    yr: "an",
    yrs: "ans",
    monthFormat: "fr-FR" as const,
  },
} as const satisfies Record<KbLang, unknown>;

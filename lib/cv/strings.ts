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
      projects: "Selected projects",
      talks: "Talks",
      publications: "Publications",
      code: "Open source",
    },
    present: "present",
    yr: "yr",
    yrs: "yrs",
    qrAlt: "Profile QR code",
    monthFormat: "en-US" as const,
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
      projects: "Projets sélectionnés",
      talks: "Conférences",
      publications: "Publications",
      code: "Open source",
    },
    present: "présent",
    yr: "an",
    yrs: "ans",
    qrAlt: "QR code du profil",
    monthFormat: "fr-FR" as const,
  },
} as const satisfies Record<KbLang, unknown>;

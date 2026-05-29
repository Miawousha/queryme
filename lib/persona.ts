import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const PersonaI18nSchema = z
  .object({
    given: z.string().min(1).optional(),
    givenWithApostrophe: z.string().min(1).optional(),
    possessive: z.string().min(1),
    objectPronoun: z.string().min(1),
    subjectPronoun: z.string().min(1),
  })
  .strict();

const PersonaSchema = z
  .object({
    id: z.string().min(1),
    fullName: z.string().min(1),
    givenName: z.string().min(1),
    shortName: z.string().min(1).optional(),
    defaultLocale: z.enum(["en", "fr"]),
    i18n: z
      .object({
        en: PersonaI18nSchema,
        fr: PersonaI18nSchema,
      })
      .strict(),
  })
  .strict();

export type Persona = z.infer<typeof PersonaSchema>;

let cached: Persona | null = null;

export function loadPersona(activeRoot: string): Persona {
  if (cached) return cached;
  const file = path.join(activeRoot, "persona.yaml");
  const raw = fs.readFileSync(file, "utf8");
  cached = PersonaSchema.parse(parseYaml(raw));
  return cached;
}

export function _resetPersonaCache(): void {
  cached = null;
}

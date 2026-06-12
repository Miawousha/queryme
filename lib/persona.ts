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

const byRoot = new Map<string, Persona>();

/** Reads and parses `<activeRoot>/persona.yaml` without touching the per-root
 * cache — sync validation runs this against freshly extracted trees. */
export function parsePersonaFile(activeRoot: string): Persona {
  const file = path.join(activeRoot, "persona.yaml");
  const raw = fs.readFileSync(file, "utf8");
  return PersonaSchema.parse(parseYaml(raw));
}

export function loadPersona(activeRoot: string): Persona {
  const cached = byRoot.get(activeRoot);
  if (cached) return cached;
  const persona = parsePersonaFile(activeRoot);
  byRoot.set(activeRoot, persona);
  return persona;
}

export function _resetPersonaCache(): void {
  byRoot.clear();
}

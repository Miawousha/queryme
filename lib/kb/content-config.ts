import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RecommendationFrontmatterSchema,
  GenericRecordSchema,
} from "./schemas";
import type { KbGroup } from "./meta-format";

/**
 * Registry of named schemas a `content.config.yaml` collection may reference.
 * Resume shapes are presets; `generic` accepts any YAML mapping / frontmatter.
 */
export const SCHEMA_REGISTRY = {
  profile: ProfileSchema,
  skills: SkillsSchema,
  education: EducationSchema,
  "public-contact": PublicContactSchema,
  experience: ExperienceFrontmatterSchema,
  project: ProjectFrontmatterSchema,
  talk: TalkFrontmatterSchema,
  recommendation: RecommendationFrontmatterSchema,
  generic: GenericRecordSchema,
} as const;
export type SchemaKey = keyof typeof SCHEMA_REGISTRY;

const SCHEMA_KEYS = Object.keys(SCHEMA_REGISTRY) as [SchemaKey, ...SchemaKey[]];

/** Which schemas fit which collection kind. `generic` fits both. */
const YAML_SCHEMAS: ReadonlySet<SchemaKey> = new Set(["profile", "skills", "education", "public-contact", "generic"]);
const MARKDOWN_SCHEMAS: ReadonlySet<SchemaKey> = new Set(["experience", "project", "talk", "recommendation", "generic"]);

const LabelSchema = z.object({ en: z.string().min(1), fr: z.string().min(1).optional() });
const SortSchema = z.object({
  field: z.string().min(1),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const CollectionConfigSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/, "collection name must be kebab-case")
      .refine((n) => n !== "other", {
        message: '"other" is a reserved collection name (the KB panel uses it as the catch-all group)',
      }),
    kind: z.enum(["yaml", "markdown"]),
    label: LabelSchema.optional(),
    schema: z.enum(SCHEMA_KEYS).optional(),
    required: z.boolean().default(false),
    sort: SortSchema.optional(),
  })
  .strict()
  .refine((c) => !(c.kind === "markdown" && c.required), {
    message: "required: true is only valid for yaml collections (markdown directories may be empty or absent)",
  });

export const ContentConfigSchema = z
  .object({
    /** Declared content locales; the FIRST is canonical (bare filename). */
    locales: z
      .array(z.enum(["en", "fr"]))
      .min(1)
      .refine(
        (arr) => arr[0] === "en" && new Set(arr).size === arr.length,
        { message: 'the first locale must be "en" (bare filenames are English) and locales must be unique' },
      )
      .default(["en", "fr"]),
    collections: z.array(CollectionConfigSchema).min(1).max(64),
  })
  .strict();
export type ContentConfig = z.infer<typeof ContentConfigSchema>;

export type ResolvedCollection = {
  name: string;
  kind: "yaml" | "markdown";
  schemaKey: SchemaKey;
  label?: { en: string; fr?: string };
  required: boolean;
  sort?: { field: string; order: "asc" | "desc" };
};

export type ResolvedContentConfig = {
  /** First locale is canonical (bare filename, no suffix). */
  locales: ("en" | "fr")[];
  collections: ResolvedCollection[];
};

/** Default per-schema sort for markdown presets — matches the legacy loadKb
 * sort rules exactly (byte-stability of the assembled KB text depends on it). */
const PRESET_DEFAULT_SORT: Partial<Record<SchemaKey, { field: string; order: "asc" | "desc" }>> = {
  experience: { field: "start", order: "desc" },
  project: { field: "year", order: "desc" },
  talk: { field: "year", order: "desc" },
  recommendation: { field: "date", order: "desc" },
};

/** The legacy resume layout, applied when a repo ships no content.config.yaml.
 * Collection order IS assembly order — do not reorder. */
export const RESUME_PRESET: ResolvedContentConfig = (() => {
  const preset: ResolvedContentConfig = {
    locales: ["en", "fr"],
    collections: [
      { name: "profile", kind: "yaml", schemaKey: "profile", required: true },
      { name: "skills", kind: "yaml", schemaKey: "skills", required: true },
      { name: "education", kind: "yaml", schemaKey: "education", required: true },
      { name: "public-contact", kind: "yaml", schemaKey: "public-contact", required: true },
      { name: "experience", kind: "markdown", schemaKey: "experience", required: false, sort: PRESET_DEFAULT_SORT.experience },
      { name: "projects", kind: "markdown", schemaKey: "project", required: false, sort: PRESET_DEFAULT_SORT.project },
      { name: "talks", kind: "markdown", schemaKey: "talk", required: false, sort: PRESET_DEFAULT_SORT.talk },
      { name: "recommendations", kind: "markdown", schemaKey: "recommendation", required: false, sort: PRESET_DEFAULT_SORT.recommendation },
    ],
  };
  preset.collections.forEach((col) => {
    if (col.sort) Object.freeze(col.sort);
    Object.freeze(col);
  });
  Object.freeze(preset.collections);
  Object.freeze(preset.locales);
  Object.freeze(preset);
  return preset;
})();

/**
 * Reads `content.config.yaml` at the persona root. Absent file → null (the
 * resume preset applies). Malformed YAML or schema → throws with a message
 * that names the file, so sync errors are actionable.
 */
export function loadContentConfig(rootDir: string): ContentConfig | null {
  const file = path.join(rootDir, "content.config.yaml");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`content.config.yaml: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`content.config.yaml: invalid YAML: ${(err as Error).message}`);
  }
  try {
    return ContentConfigSchema.parse(parsed);
  } catch (err) {
    throw new Error(`content.config.yaml: ${(err as Error).message}`);
  }
}

/**
 * Turns a parsed config into the resolved descriptor list the engine runs on.
 * `null` → the resume preset. Enforces: unique names, schema/kind affinity,
 * and the presence of the `profile` + `public-contact` yaml collections (the
 * app shell — page header, CV title, forward-question email — depends on them).
 */
export function resolveContentConfig(config: ContentConfig | null): ResolvedContentConfig {
  if (config === null) return RESUME_PRESET;
  const names = new Set<string>();
  const collections: ResolvedCollection[] = config.collections.map((c) => {
    if (names.has(c.name)) {
      throw new Error(`content.config.yaml: duplicate collection name "${c.name}"`);
    }
    names.add(c.name);
    const schemaKey: SchemaKey = c.schema ?? "generic";
    const allowed = c.kind === "yaml" ? YAML_SCHEMAS : MARKDOWN_SCHEMAS;
    if (!allowed.has(schemaKey)) {
      throw new Error(
        `content.config.yaml: collection "${c.name}" — schema "${schemaKey}" cannot be used with kind "${c.kind}"`,
      );
    }
    return {
      name: c.name,
      kind: c.kind,
      schemaKey,
      label: c.label,
      required: c.required,
      sort: c.sort ?? (c.kind === "markdown" ? PRESET_DEFAULT_SORT[schemaKey] : undefined),
    };
  });
  for (const must of ["profile", "public-contact"] as const) {
    const col = collections.find((c) => c.name === must);
    if (!col || col.kind !== "yaml" || col.schemaKey !== must) {
      throw new Error(
        `content.config.yaml: a yaml collection "${must}" with schema "${must}" is required (the app shell depends on it)`,
      );
    }
    // Force required regardless of what the config declared — Task 5 sync gate
    // derives the mandatory-file set from these flags, and the app shell
    // unconditionally depends on both collections.
    col.required = true;
  }
  return { locales: config.locales, collections };
}

/** The KB panel's directory groups: markdown collections in config order. */
export function kbGroups(config: ResolvedContentConfig): KbGroup[] {
  return config.collections
    .filter((c) => c.kind === "markdown")
    .map((c) => (c.label ? { name: c.name, label: c.label } : { name: c.name }));
}

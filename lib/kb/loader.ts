import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import {
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type RecommendationFrontmatter,
} from "./schemas";
import {
  SCHEMA_REGISTRY,
  RESUME_PRESET,
  loadContentConfig,
  resolveContentConfig,
  type ResolvedCollection,
  type ResolvedContentConfig,
} from "./content-config";

export type KbLang = "en" | "fr";

/** One markdown entry of any collection. `F` narrows the frontmatter for the
 * resume preset projections below. */
export type GenericEntry<F = Record<string, unknown>> = {
  slug: string;
  relativePath: string;
  frontmatter: F;
  body: string;
};

export type ExperienceEntry = GenericEntry<ExperienceFrontmatter>;
export type ProjectEntry = GenericEntry<ProjectFrontmatter>;
export type TalkEntry = GenericEntry<TalkFrontmatter>;
export type RecommendationEntry = GenericEntry<RecommendationFrontmatter>;

export type LoadedCollection =
  | { kind: "markdown"; config: ResolvedCollection; entries: GenericEntry[] }
  | { kind: "yaml"; config: ResolvedCollection; relativePath: string; data: unknown; raw: string };

export type LoadedContent = {
  config: ResolvedContentConfig;
  lang: KbLang;
  collections: Map<string, LoadedCollection>;
};

/** The typed resume projection consumed by the CV and other resume surfaces. */
export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  talks: TalkEntry[];
  recommendations: RecommendationEntry[];
};

/**
 * Resolves a KB file path to its localized variant when one exists, else
 * falls back to the canonical English file. `base` is the path WITHOUT the
 * extension (e.g. `kb/experience/2024-fixture-co` for an `.md` file, or
 * `kb/profile` for a `.yaml` file).
 */
async function pickFile(base: string, ext: string, lang: KbLang): Promise<string> {
  if (lang !== "en") {
    const localized = `${base}.${lang}.${ext}`;
    try {
      await fs.access(localized);
      return localized;
    } catch {
      /* sidecar missing — fall through */
    }
  }
  return `${base}.${ext}`;
}

async function readYamlCollection(
  kbDir: string,
  col: ResolvedCollection,
  lang: KbLang,
): Promise<LoadedCollection | null> {
  const file = await pickFile(path.join(kbDir, col.name), "yaml", lang);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if (!col.required && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`KB: failed to read ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`KB: failed to parse YAML in ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  let data: unknown;
  try {
    data = SCHEMA_REGISTRY[col.schemaKey].parse(parsed);
  } catch (err) {
    throw new Error(`KB: schema validation failed for ${col.name}.yaml (${file}): ${(err as Error).message}`);
  }
  return { kind: "yaml", config: col, relativePath: `${col.name}.yaml`, data, raw };
}

async function readMarkdownDir(
  dir: string,
  schema: { parse: (v: unknown) => unknown },
  label: string,
  lang: KbLang,
): Promise<GenericEntry[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  // Filter out localized sidecars at directory listing — we resolve them via
  // pickFile per canonical entry below.
  const md = files
    .filter((f) => f.endsWith(".md") && !/\.(en|fr)\.md$/.test(f))
    .sort();
  const out: GenericEntry[] = [];
  for (const file of md) {
    const canonicalRel = `${path.basename(dir)}/${file}`;
    const base = path.join(dir, file.replace(/\.md$/, ""));
    const actual = await pickFile(base, "md", lang);
    let raw: string;
    try {
      raw = await fs.readFile(actual, "utf8");
    } catch (err) {
      throw new Error(`KB: failed to read ${label} (${actual}): ${(err as Error).message}`);
    }
    const parsed = matter(raw);
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = schema.parse(parsed.data) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`KB: frontmatter validation failed for ${label} ${file}: ${(err as Error).message}`);
    }
    out.push({
      slug: file.replace(/\.md$/, ""),
      // CANONICAL path — citations cite this regardless of which variant we
      // actually read, so citation tokens stay stable across languages.
      relativePath: canonicalRel,
      frontmatter,
      body: parsed.content.trim(),
    });
  }
  return out;
}

/** Comparable sort key: `"present"` maps high so open-ended ranges sort first
 * under desc (matches the legacy experience sort). */
function sortValue(v: unknown): string | number | undefined {
  if (v === "present") return "9999-99";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" || typeof v === "number") return v;
  return undefined;
}

function compareEntries(field: string, order: "asc" | "desc") {
  const dir = order === "asc" ? 1 : -1;
  return (a: GenericEntry, b: GenericEntry): number => {
    const av = sortValue(a.frontmatter[field]);
    const bv = sortValue(b.frontmatter[field]);
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1; // missing sorts last either way
    if (bv === undefined) return -1;
    // Cross-type: numbers rank before strings regardless of sort direction.
    // Applied before the dir multiplier so the type rank is stable in both asc and desc.
    if (typeof av !== typeof bv) return typeof av === "number" ? -1 : 1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  };
}

/** Loads every collection a config declares from `kbDir`. Optional yaml
 * collections whose file is absent are omitted from the map; markdown
 * collections with an absent directory load as empty. */
export async function loadCollections(
  kbDir: string,
  lang: KbLang,
  config: ResolvedContentConfig,
): Promise<Map<string, LoadedCollection>> {
  const stat = await fs.stat(kbDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`KB: root directory does not exist: ${kbDir}`);
  }
  const loaded = await Promise.all(
    config.collections.map(async (col): Promise<[string, LoadedCollection] | null> => {
      if (col.kind === "yaml") {
        const c = await readYamlCollection(kbDir, col, lang);
        return c ? [col.name, c] : null;
      }
      const entries = await readMarkdownDir(
        path.join(kbDir, col.name),
        SCHEMA_REGISTRY[col.schemaKey],
        col.name,
        lang,
      );
      if (col.sort) entries.sort(compareEntries(col.sort.field, col.sort.order));
      return [col.name, { kind: "markdown", config: col, entries }];
    }),
  );
  return new Map(loaded.filter((x): x is [string, LoadedCollection] => x !== null));
}

/** Root-level entry point: resolves the repo's content config (resume preset
 * when absent) and loads its collections from `<rootDir>/kb`. */
export async function loadContent(rootDir: string, lang: KbLang = "en"): Promise<LoadedContent> {
  const config = resolveContentConfig(loadContentConfig(rootDir));
  const collections = await loadCollections(path.join(rootDir, "kb"), lang, config);
  return { config, lang, collections };
}

/**
 * Projects engine output into the typed resume `Kb`. Collections that are
 * absent (or that a custom config re-typed away from the preset schema) fall
 * back to empty; `profile` and `public-contact` are mandatory because the app
 * shell renders from them.
 */
export function toResumeKb(content: LoadedContent): Kb {
  const yamlData = <T>(name: string, schemaKey: string): T | undefined => {
    const c = content.collections.get(name);
    return c?.kind === "yaml" && c.config.schemaKey === schemaKey ? (c.data as T) : undefined;
  };
  const mdEntries = <F>(name: string, schemaKey: string): GenericEntry<F>[] => {
    const c = content.collections.get(name);
    return c?.kind === "markdown" && c.config.schemaKey === schemaKey
      ? (c.entries as GenericEntry<F>[])
      : [];
  };
  const profile = yamlData<Profile>("profile", "profile");
  const publicContact = yamlData<PublicContact>("public-contact", "public-contact");
  if (!profile || !publicContact) {
    throw new Error("KB: the profile and public-contact collections are required");
  }
  return {
    profile,
    publicContact,
    skills: yamlData<Skills>("skills", "skills") ?? { skills: [] },
    education: yamlData<Education>("education", "education") ?? { entries: [] },
    experience: mdEntries<ExperienceFrontmatter>("experience", "experience"),
    projects: mdEntries<ProjectFrontmatter>("projects", "project"),
    talks: mdEntries<TalkFrontmatter>("talks", "talk"),
    recommendations: mdEntries<RecommendationFrontmatter>("recommendations", "recommendation"),
  };
}

/** Legacy entry point: loads `kbDir` with the resume preset (no config read).
 * Kept for callers/tests that address the kb directory directly. */
export async function loadKb(kbDir: string, lang: KbLang = "en"): Promise<Kb> {
  const collections = await loadCollections(kbDir, lang, RESUME_PRESET);
  return toResumeKb({ config: RESUME_PRESET, lang, collections });
}

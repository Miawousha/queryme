import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RepoFrontmatterSchema,
  RecommendationFrontmatterSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type RepoFrontmatter,
  type RecommendationFrontmatter,
} from "./schemas";

export type ExperienceEntry = {
  slug: string;
  relativePath: string;
  frontmatter: ExperienceFrontmatter;
  body: string;
};

export type ProjectEntry = {
  slug: string;
  relativePath: string;
  frontmatter: ProjectFrontmatter;
  body: string;
};

export type TalkEntry = {
  slug: string;
  relativePath: string;
  frontmatter: TalkFrontmatter;
  body: string;
};

export type RepoEntry = {
  slug: string;
  relativePath: string;
  frontmatter: RepoFrontmatter;
  body: string;
};

export type RecommendationEntry = {
  slug: string;
  relativePath: string;
  frontmatter: RecommendationFrontmatter;
  body: string;
};

export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  talks: TalkEntry[];
  code: RepoEntry[];
  recommendations: RecommendationEntry[];
};

export type KbLang = "en" | "fr";

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

async function readYamlFile<T>(file: string, schema: { parse: (v: unknown) => T }, label: string): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    throw new Error(`KB: failed to read ${label} (${file}): ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`KB: failed to parse YAML in ${label} (${file}): ${(err as Error).message}`);
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    throw new Error(`KB: schema validation failed for ${label} (${file}): ${(err as Error).message}`);
  }
}

async function readMarkdownDir<F>(
  dir: string,
  schema: { parse: (v: unknown) => F },
  label: string,
  lang: KbLang,
): Promise<Array<{ slug: string; relativePath: string; frontmatter: F; body: string }>> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  // Filter out localized sidecars at directory listing — we resolve them via
  // pickFile per canonical entry below.
  const md = files
    .filter((f) => f.endsWith(".md") && !/\.[a-z]{2}\.md$/.test(f))
    .sort();
  const out = [];
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
    let frontmatter: F;
    try {
      frontmatter = schema.parse(parsed.data);
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

function startSortKey(start: string) {
  return start === "present" ? "9999-99" : start;
}

export async function loadKb(rootDir: string, lang: KbLang = "en"): Promise<Kb> {
  const stat = await fs.stat(rootDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`KB: root directory does not exist: ${rootDir}`);
  }

  const [
    profile, skills, education, publicContact,
    experience, projects,
    talks, code, recommendations,
  ] = await Promise.all([
    readYamlFile(await pickFile(path.join(rootDir, "profile"), "yaml", lang), ProfileSchema, "profile.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "skills"), "yaml", lang), SkillsSchema, "skills.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "education"), "yaml", lang), EducationSchema, "education.yaml"),
    readYamlFile(await pickFile(path.join(rootDir, "public-contact"), "yaml", lang), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience", lang),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects", lang),
    readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks", lang),
    readMarkdownDir(path.join(rootDir, "code"), RepoFrontmatterSchema, "code", lang),
    readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations", lang),
  ]);

  experience.sort((a, b) => (startSortKey(a.frontmatter.start) < startSortKey(b.frontmatter.start) ? 1 : -1));
  projects.sort((a, b) => (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0));
  talks.sort((a, b) => b.frontmatter.year - a.frontmatter.year);
  code.sort((a, b) =>
    (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0) || a.frontmatter.name.localeCompare(b.frontmatter.name),
  );
  recommendations.sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));

  return {
    profile,
    skills,
    education,
    publicContact,
    experience,
    projects,
    talks,
    code,
    recommendations,
  };
}

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
  OpenSourceFrontmatterSchema,
  RecommendationFrontmatterSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type TalkFrontmatter,
  type OpenSourceFrontmatter,
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

export type OpenSourceEntry = {
  slug: string;
  relativePath: string;
  frontmatter: OpenSourceFrontmatter;
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
  openSource: OpenSourceEntry[];
  recommendations: RecommendationEntry[];
};

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
): Promise<Array<{ slug: string; relativePath: string; frontmatter: F; body: string }>> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const md = files.filter((f) => f.endsWith(".md")).sort();
  const out = [];
  for (const file of md) {
    const full = path.join(dir, file);
    let raw: string;
    try {
      raw = await fs.readFile(full, "utf8");
    } catch (err) {
      throw new Error(`KB: failed to read ${label} (${full}): ${(err as Error).message}`);
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
      relativePath: `${path.basename(dir)}/${file}`,
      frontmatter,
      body: parsed.content.trim(),
    });
  }
  return out;
}

function startSortKey(start: string) {
  return start === "present" ? "9999-99" : start;
}

export async function loadKb(rootDir: string): Promise<Kb> {
  const stat = await fs.stat(rootDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`KB: root directory does not exist: ${rootDir}`);
  }

  const [
    profile, skills, education, publicContact,
    experience, projects,
    talks, openSource, recommendations,
  ] = await Promise.all([
    readYamlFile(path.join(rootDir, "profile.yaml"), ProfileSchema, "profile.yaml"),
    readYamlFile(path.join(rootDir, "skills.yaml"), SkillsSchema, "skills.yaml"),
    readYamlFile(path.join(rootDir, "education.yaml"), EducationSchema, "education.yaml"),
    readYamlFile(path.join(rootDir, "public-contact.yaml"), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience"),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects"),
    readMarkdownDir(path.join(rootDir, "talks"), TalkFrontmatterSchema, "talks"),
    readMarkdownDir(path.join(rootDir, "open-source"), OpenSourceFrontmatterSchema, "open-source"),
    readMarkdownDir(path.join(rootDir, "recommendations"), RecommendationFrontmatterSchema, "recommendations"),
  ]);

  experience.sort((a, b) => (startSortKey(a.frontmatter.start) < startSortKey(b.frontmatter.start) ? 1 : -1));
  projects.sort((a, b) => (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0));
  talks.sort((a, b) => b.frontmatter.year - a.frontmatter.year);
  openSource.sort((a, b) =>
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
    openSource,
    recommendations,
  };
}

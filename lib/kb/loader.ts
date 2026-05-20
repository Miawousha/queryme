import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { decryptSensitive } from "./crypto";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  SalarySchema,
  ReferencesSchema,
  PrivateContactSchema,
  type Profile,
  type Skills,
  type Education,
  type PublicContact,
  type ExperienceFrontmatter,
  type ProjectFrontmatter,
  type Salary,
  type References,
  type PrivateContact,
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

export type SensitiveKb = {
  salary: Salary | null;
  references: References | null;
  privateContact: PrivateContact | null;
};

export type Kb = {
  profile: Profile;
  skills: Skills;
  education: Education;
  publicContact: PublicContact;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  sensitive: SensitiveKb;
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

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function parseAndValidate<T>(raw: string, schema: { parse: (v: unknown) => T }, label: string): T {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`KB: failed to parse YAML in ${label}: ${(err as Error).message}`);
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    throw new Error(`KB: schema validation failed for ${label}: ${(err as Error).message}`);
  }
}

/**
 * Loads a sensitive KB file. Prefers the committed ciphertext (`<name>.enc`,
 * decrypted with KB_SENSITIVE_KEY); falls back to a plaintext `<name>` if no
 * `.enc` exists (local dev / test fixtures). If a `.enc` exists but the key is
 * absent, the section is treated as unavailable — fail-closed, never leak.
 */
async function readOptionalSensitiveYaml<T>(
  dir: string,
  baseName: string,
  schema: { parse: (v: unknown) => T },
  label: string,
): Promise<T | null> {
  const encPath = path.join(dir, `${baseName}.enc`);
  const plainPath = path.join(dir, baseName);

  if (await fileExists(encPath)) {
    const key = process.env.KB_SENSITIVE_KEY;
    if (!key) {
      console.warn(
        `KB: ${label} is encrypted but KB_SENSITIVE_KEY is not set — sensitive content unavailable.`,
      );
      return null;
    }
    let ciphertext: string;
    try {
      ciphertext = await fs.readFile(encPath, "utf8");
    } catch (err) {
      throw new Error(`KB: failed to read ${label} (${encPath}): ${(err as Error).message}`);
    }
    let raw: string;
    try {
      raw = decryptSensitive(ciphertext, key);
    } catch (err) {
      throw new Error(`KB: failed to decrypt ${label} (${encPath}): ${(err as Error).message}`);
    }
    return parseAndValidate(raw, schema, label);
  }

  if (await fileExists(plainPath)) {
    return await readYamlFile(plainPath, schema, label);
  }
  return null;
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

  const [profile, skills, education, publicContact, experience, projects] = await Promise.all([
    readYamlFile(path.join(rootDir, "profile.yaml"), ProfileSchema, "profile.yaml"),
    readYamlFile(path.join(rootDir, "skills.yaml"), SkillsSchema, "skills.yaml"),
    readYamlFile(path.join(rootDir, "education.yaml"), EducationSchema, "education.yaml"),
    readYamlFile(path.join(rootDir, "public-contact.yaml"), PublicContactSchema, "public-contact.yaml"),
    readMarkdownDir(path.join(rootDir, "experience"), ExperienceFrontmatterSchema, "experience"),
    readMarkdownDir(path.join(rootDir, "projects"), ProjectFrontmatterSchema, "projects"),
  ]);

  experience.sort((a, b) => (startSortKey(a.frontmatter.start) < startSortKey(b.frontmatter.start) ? 1 : -1));
  projects.sort((a, b) => (b.frontmatter.year ?? 0) - (a.frontmatter.year ?? 0));

  const sensitiveDir = path.join(rootDir, "sensitive");
  const [salary, references, privateContact] = await Promise.all([
    readOptionalSensitiveYaml(sensitiveDir, "salary.yaml", SalarySchema, "sensitive/salary.yaml"),
    readOptionalSensitiveYaml(sensitiveDir, "references.yaml", ReferencesSchema, "sensitive/references.yaml"),
    readOptionalSensitiveYaml(sensitiveDir, "private-contact.yaml", PrivateContactSchema, "sensitive/private-contact.yaml"),
  ]);

  return {
    profile,
    skills,
    education,
    publicContact,
    experience,
    projects,
    sensitive: { salary, references, privateContact },
  };
}

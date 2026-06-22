import { z } from "zod";

export const LanguageCode = z.enum(["en", "fr"]);

// YYYY-MM or YYYY-MM-DD or the literal "present"
const DateOrPresent = z.union([
  z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  z.literal("present"),
]);

export const ProfileSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  // Optional professional summary shown as a paragraph under the headline on the CV.
  bio: z.string().optional(),
  // Optional "Selected achievements" band on the CV — short, impact-led bullets
  // (markdown allowed for a bold lead). Absent → the band is not rendered.
  achievements: z.array(z.string().min(1)).optional(),
  location: z.string().optional(),
  languages: z.array(LanguageCode).optional(),
  photo: z.string().optional(),
  links: z
    .object({
      linkedin: z.url().optional(),
      github: z.url().optional(),
      website: z.url().optional(),
      twitter: z.url().optional(),
    })
    .optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SkillSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  years: z.number().min(0),
  tags: z.array(z.string()).optional(),
});
export const SkillsSchema = z.object({ skills: z.array(SkillSchema) });
export type Skills = z.infer<typeof SkillsSchema>;

export const EducationEntrySchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  start: DateOrPresent,
  end: DateOrPresent,
  notes: z.string().optional(),
});
export const EducationSchema = z.object({ entries: z.array(EducationEntrySchema) });
export type Education = z.infer<typeof EducationSchema>;

export const PublicContactSchema = z.object({
  email: z.email().optional(),
  links: z
    .object({
      linkedin: z.url().optional(),
      github: z.url().optional(),
      website: z.url().optional(),
      twitter: z.url().optional(),
    })
    .optional(),
});
export type PublicContact = z.infer<typeof PublicContactSchema>;

export const ExperienceFrontmatterSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  start: DateOrPresent,
  end: DateOrPresent,
  location: z.string().optional(),
  // One-line summary shown on the printable CV under the role title.
  summary: z.string().optional(),
  // Curated CV bullets for the printable resume. When empty, the CV renderer
  // falls back to the first bullet list in the markdown body.
  highlights: z.array(z.string().min(1).max(280)).max(8).optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type ExperienceFrontmatter = z.infer<typeof ExperienceFrontmatterSchema>;

export const RepoSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["author", "maintainer", "contributor"]),
  url: z.url().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  /** One-line subtitle for the panel + CV. The project body holds the narrative. */
  description: z.string().optional(),
  language: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  /** YYYY-MM of last activity. */
  last_active: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stars: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  stack: z.array(z.string()).optional(),
  /** Free-form; no registry validation. */
  tags: z.array(z.string()).optional(),
});
export type Repo = z.infer<typeof RepoSchema>;

export const ProjectFrontmatterSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  url: z.url().optional(),
  /** Repos hosted under this project (replaces the old top-level `code/` category). */
  repos: z.array(RepoSchema).optional(),
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;

export const TalkFrontmatterSchema = z.object({
  title: z.string().min(1),
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  location: z.string().optional(),
  url: z.url().optional(),
  tags: z.array(z.string()).optional(),
});
export type TalkFrontmatter = z.infer<typeof TalkFrontmatterSchema>;

export const RecommendationFrontmatterSchema = z.object({
  from: z.string().min(1),
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}$/),
  relationship: z.string().optional(),
  url: z.url().optional(),
});
export type RecommendationFrontmatter = z.infer<typeof RecommendationFrontmatterSchema>;

/**
 * Permissive shape for config-declared generic collections: any YAML mapping /
 * markdown frontmatter object. Views render only scalar keys; validation here
 * just guarantees "it is an object".
 */
export const GenericRecordSchema = z.record(z.string(), z.unknown());
export type GenericRecord = z.infer<typeof GenericRecordSchema>;

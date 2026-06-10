import type {
  Kb,
  KbLang,
  LoadedCollection,
  LoadedContent,
  ExperienceEntry,
  ProjectEntry,
  TalkEntry,
  RecommendationEntry,
} from "./loader";
import type { Profile, Skills, Education, PublicContact, Repo } from "./schemas";
import { humanizeSlug } from "./meta-format";

/** Legacy typed entry point — exact output preserved (resume surfaces, tests). */
export function assemblePublicKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb.profile, "Profile", "profile.yaml"));
  sections.push(renderSkills(kb.skills, "Skills", "skills.yaml"));
  sections.push(renderEducation(kb.education, "Education", "education.yaml"));
  sections.push(renderPublicContact(kb.publicContact, "Public contact", "public-contact.yaml"));
  sections.push(renderExperience(kb.experience, "Experience"));
  sections.push(renderProjects(kb.projects, "Projects"));
  if (kb.talks.length) sections.push(renderTalks(kb.talks, "Talks"));
  if (kb.recommendations.length) sections.push(renderRecommendations(kb.recommendations, "Recommendations"));

  return sections.join("\n\n");
}

/**
 * Engine entry point: renders collections in config order. Preset schemas use
 * the legacy renderers (byte-identical for no-config repos); generic
 * collections get a structural rendering with the same `[ref:]` convention.
 */
export function assembleContentText(content: LoadedContent): string {
  const sections: string[] = [];
  for (const col of content.config.collections) {
    const loaded = content.collections.get(col.name);
    if (!loaded) continue;
    const text = renderCollection(loaded, content.lang);
    if (text !== null) sections.push(text);
  }
  return sections.join("\n\n");
}

function renderCollection(loaded: LoadedCollection, lang: KbLang): string | null {
  if (loaded.kind === "yaml") {
    const heading = labelFor(loaded, lang);
    const refPath = loaded.relativePath;
    switch (loaded.config.schemaKey) {
      case "profile":
        return renderProfile(loaded.data as Profile, heading, refPath);
      case "skills":
        return renderSkills(loaded.data as Skills, heading, refPath);
      case "education":
        return renderEducation(loaded.data as Education, heading, refPath);
      case "public-contact":
        return renderPublicContact(loaded.data as PublicContact, heading, refPath);
      default:
        return renderGenericYaml(loaded, lang);
    }
  }
  const heading = labelFor(loaded, lang);
  switch (loaded.config.schemaKey) {
    case "experience":
      return renderExperience(loaded.entries as ExperienceEntry[], heading);
    case "project":
      return renderProjects(loaded.entries as ProjectEntry[], heading);
    case "talk":
      return loaded.entries.length ? renderTalks(loaded.entries as TalkEntry[], heading) : null;
    case "recommendation":
      return loaded.entries.length
        ? renderRecommendations(loaded.entries as RecommendationEntry[], heading)
        : null;
    default:
      return loaded.entries.length ? renderGenericMarkdown(loaded, lang) : null;
  }
}

function labelFor(loaded: LoadedCollection, lang: KbLang): string {
  const label = loaded.config.label;
  return (lang === "fr" ? label?.fr : undefined) ?? label?.en ?? humanizeSlug(loaded.config.name);
}

/** Generic yaml: the raw file IS the structured content — emit it fenced
 * under a heading + ref so the agent can read and cite it. */
function renderGenericYaml(
  loaded: Extract<LoadedCollection, { kind: "yaml" }>,
  lang: KbLang,
): string {
  return [
    `# ${labelFor(loaded, lang)}`,
    `[ref: ${loaded.relativePath}]`,
    ``,
    "```yaml",
    loaded.raw.trim(),
    "```",
  ].join("\n");
}

/** Scalars and scalar arrays render on the entry's metadata lines; nested
 * objects are skipped — the body carries the narrative. */
function scalarOrList(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return v === "" ? null : v.replace(/\s*\n\s*/g, " ");
  if (Array.isArray(v)) {
    const items = v
      .map((x): string | null => {
        if (x instanceof Date) return x.toISOString().slice(0, 10);
        if (typeof x === "string" && x !== "") return x;
        if (typeof x === "number" || typeof x === "boolean") return String(x);
        return null;
      })
      .filter((x): x is string => x !== null);
    return items.length === 0 ? null : items.join(", ");
  }
  return null;
}

function renderGenericMarkdown(
  loaded: Extract<LoadedCollection, { kind: "markdown" }>,
  lang: KbLang,
): string {
  const lines = [`# ${labelFor(loaded, lang)}`, ``];
  for (const e of loaded.entries) {
    const fm = e.frontmatter;
    const rawTitle =
      (typeof fm.title === "string" && fm.title) ||
      (typeof fm.name === "string" && fm.name) ||
      humanizeSlug(e.slug);
    const title = rawTitle.replace(/\s*\n\s*/g, " ");
    lines.push(`## ${title}`);
    lines.push(`[ref: ${e.relativePath}]`);
    for (const [k, v] of Object.entries(fm)) {
      if (k === "title" || k === "name") continue;
      const rendered = scalarOrList(v);
      if (rendered !== null) lines.push(`${k}: ${rendered}`);
    }
    lines.push(``, e.body, ``);
  }
  return lines.join("\n");
}

function renderProfile(profile: Profile, heading: string, refPath: string): string {
  const lines = [
    `# ${heading}`,
    `[ref: ${refPath}]`,
    ``,
    `Name: ${profile.name}`,
    `Headline: ${profile.headline}`,
  ];
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages?.length) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.links) {
    for (const [k, v] of Object.entries(profile.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderSkills(skills: Skills, heading: string, refPath: string): string {
  const lines = [`# ${heading}`, `[ref: ${refPath}]`, ``];
  for (const skill of skills.skills) {
    const tags = skill.tags?.length ? ` (tags: ${skill.tags.join(", ")})` : "";
    lines.push(`- ${skill.name} — level: ${skill.level}/5, years: ${skill.years}${tags}`);
  }
  return lines.join("\n");
}

function renderEducation(education: Education, heading: string, refPath: string): string {
  const lines = [`# ${heading}`, `[ref: ${refPath}]`, ``];
  for (const e of education.entries) {
    const notes = e.notes ? ` — ${e.notes}` : "";
    lines.push(`- ${e.institution}, ${e.degree} (${e.start} → ${e.end})${notes}`);
  }
  return lines.join("\n");
}

function renderPublicContact(publicContact: PublicContact, heading: string, refPath: string): string {
  const lines = [`# ${heading}`, `[ref: ${refPath}]`, ``];
  if (publicContact.email) lines.push(`Email: ${publicContact.email}`);
  if (publicContact.links) {
    for (const [k, v] of Object.entries(publicContact.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderExperience(entries: ExperienceEntry[], heading: string): string {
  const lines = [`# ${heading}`, ``];
  for (const e of entries) {
    const { company, role, start, end, location, stack, tags } = e.frontmatter;
    lines.push(`## ${company} — ${role} (${start} → ${end})`);
    lines.push(`[ref: ${e.relativePath}]`);
    if (location) lines.push(`Location: ${location}`);
    if (stack?.length) lines.push(`Stack: ${stack.join(", ")}`);
    if (tags?.length) lines.push(`Tags: ${tags.join(", ")}`);
    lines.push(``);
    lines.push(e.body);
    lines.push(``);
  }
  return lines.join("\n");
}

function renderProjects(entries: ProjectEntry[], heading: string): string {
  const lines = [`# ${heading}`, ``];
  for (const p of entries) {
    const year = p.frontmatter.year ? ` (${p.frontmatter.year})` : "";
    lines.push(`## ${p.frontmatter.name}${year}`);
    lines.push(`[ref: ${p.relativePath}]`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.stack?.length) lines.push(`Stack: ${p.frontmatter.stack.join(", ")}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``);
    lines.push(p.body);
    const repos = p.frontmatter.repos ?? [];
    if (repos.length) {
      lines.push(``, `### Repositories`);
      for (const r of repos) lines.push(renderRepoLine(r));
    }
    lines.push(``);
  }
  return lines.join("\n");
}

function renderRepoLine(r: Repo): string {
  const meta: string[] = [`role: ${r.role}`, `visibility: ${r.visibility}`];
  if (r.url) meta.push(`url: ${r.url}`);
  if (r.language) meta.push(`language: ${r.language}`);
  if (r.year !== undefined) meta.push(`year: ${r.year}`);
  if (r.last_active) meta.push(`last active: ${r.last_active}`);
  if (r.stars !== undefined) meta.push(`stars: ${r.stars}`);
  if (r.archived) meta.push(`archived`);
  if (r.stack?.length) meta.push(`stack: ${r.stack.join(", ")}`);
  if (r.tags?.length) meta.push(`tags: ${r.tags.join(", ")}`);
  const desc = r.description ? ` — ${r.description}` : "";
  return `- ${r.name}${desc} (${meta.join(", ")})`;
}

function renderTalks(entries: TalkEntry[], heading: string): string {
  const lines = [`# ${heading}`, ``];
  for (const t of entries) {
    const where = t.frontmatter.location ? ` — ${t.frontmatter.location}` : "";
    lines.push(`## ${t.frontmatter.title} (${t.frontmatter.year})`);
    lines.push(`[ref: ${t.relativePath}]`);
    lines.push(`Venue: ${t.frontmatter.venue}${where}`);
    if (t.frontmatter.url) lines.push(`URL: ${t.frontmatter.url}`);
    if (t.frontmatter.tags?.length) lines.push(`Tags: ${t.frontmatter.tags.join(", ")}`);
    lines.push(``, t.body, ``);
  }
  return lines.join("\n");
}

function renderRecommendations(entries: RecommendationEntry[], heading: string): string {
  const lines = [`# ${heading}`, ``];
  for (const r of entries) {
    lines.push(`## ${r.frontmatter.from} — ${r.frontmatter.title} (${r.frontmatter.date})`);
    lines.push(`[ref: ${r.relativePath}]`);
    if (r.frontmatter.relationship) lines.push(`Relationship: ${r.frontmatter.relationship}`);
    if (r.frontmatter.url) lines.push(`URL: ${r.frontmatter.url}`);
    lines.push(``, r.body, ``);
  }
  return lines.join("\n");
}

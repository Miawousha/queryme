import type { Kb } from "./loader";

export type AssembleOptions = {
  /**
   * Slugs to inline as full entries under `# Code (featured)`. Remaining code
   * entries render as one-line stubs under `# Code (index)`.
   *
   * `undefined` or empty array → today's behaviour: single `# Code` section
   * with full bodies for all entries.
   */
  featuredCodeSlugs?: string[];
};

export function assemblePublicKbText(kb: Kb, options: AssembleOptions = {}): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));
  if (kb.talks.length) sections.push(renderTalks(kb));
  if (kb.code.length) {
    const featured = (options.featuredCodeSlugs ?? []).length > 0 ? options.featuredCodeSlugs! : null;
    if (featured === null) {
      sections.push(renderRepos(kb.code, "# Code"));
    } else {
      const featuredSet = new Set(featured);
      const featuredEntries = featured
        .map((slug) => kb.code.find((r) => r.slug === slug))
        .filter((r): r is (typeof kb.code)[number] => r !== undefined);
      const indexedEntries = kb.code.filter((r) => !featuredSet.has(r.slug));

      if (featuredEntries.length) sections.push(renderRepos(featuredEntries, "# Code (featured)"));
      if (indexedEntries.length) sections.push(renderIndexedRepos(indexedEntries));
    }
  }
  if (kb.recommendations.length) sections.push(renderRecommendations(kb));

  return sections.join("\n\n");
}

function renderProfile(kb: Kb): string {
  const { profile } = kb;
  const lines = [
    `# Profile`,
    `[ref: profile.yaml]`,
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

function renderSkills(kb: Kb): string {
  const lines = [`# Skills`, `[ref: skills.yaml]`, ``];
  for (const skill of kb.skills.skills) {
    const tags = skill.tags?.length ? ` (tags: ${skill.tags.join(", ")})` : "";
    lines.push(`- ${skill.name} — level: ${skill.level}/5, years: ${skill.years}${tags}`);
  }
  return lines.join("\n");
}

function renderEducation(kb: Kb): string {
  const lines = [`# Education`, `[ref: education.yaml]`, ``];
  for (const e of kb.education.entries) {
    const notes = e.notes ? ` — ${e.notes}` : "";
    lines.push(`- ${e.institution}, ${e.degree} (${e.start} → ${e.end})${notes}`);
  }
  return lines.join("\n");
}

function renderPublicContact(kb: Kb): string {
  const lines = [`# Public contact`, `[ref: public-contact.yaml]`, ``];
  if (kb.publicContact.email) lines.push(`Email: ${kb.publicContact.email}`);
  if (kb.publicContact.links) {
    for (const [k, v] of Object.entries(kb.publicContact.links)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function renderExperience(kb: Kb): string {
  const lines = [`# Experience`, ``];
  for (const e of kb.experience) {
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

function renderProjects(kb: Kb): string {
  const lines = [`# Projects`, ``];
  for (const p of kb.projects) {
    const year = p.frontmatter.year ? ` (${p.frontmatter.year})` : "";
    lines.push(`## ${p.frontmatter.name}${year}`);
    lines.push(`[ref: ${p.relativePath}]`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.stack?.length) lines.push(`Stack: ${p.frontmatter.stack.join(", ")}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``);
    lines.push(p.body);
    lines.push(``);
  }
  return lines.join("\n");
}

function renderTalks(kb: Kb): string {
  const lines = [`# Talks`, ``];
  for (const t of kb.talks) {
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

function renderRepos(entries: Kb["code"], heading: string): string {
  const lines = [heading, ``];
  for (const p of entries) {
    lines.push(`## ${p.frontmatter.name}`);
    lines.push(`[ref: ${p.relativePath}]`);
    lines.push(`Role: ${p.frontmatter.role}`);
    lines.push(`Visibility: ${p.frontmatter.visibility}`);
    if (p.frontmatter.url) lines.push(`URL: ${p.frontmatter.url}`);
    if (p.frontmatter.language) lines.push(`Language: ${p.frontmatter.language}`);
    if (p.frontmatter.year !== undefined) lines.push(`Year: ${p.frontmatter.year}`);
    if (p.frontmatter.last_active) lines.push(`Last active: ${p.frontmatter.last_active}`);
    if (p.frontmatter.code_bytes !== undefined) lines.push(`Code size: ${p.frontmatter.code_bytes} bytes`);
    if (p.frontmatter.stars !== undefined) lines.push(`Stars: ${p.frontmatter.stars}`);
    if (p.frontmatter.archived) lines.push(`Archived: yes`);
    if (p.frontmatter.description) lines.push(`Description: ${p.frontmatter.description}`);
    if (p.frontmatter.tags?.length) lines.push(`Tags: ${p.frontmatter.tags.join(", ")}`);
    lines.push(``, p.body, ``);
  }
  return lines.join("\n");
}

function renderIndexedRepos(entries: Kb["code"]): string {
  const lines = ["# Code (index)", ""];
  for (const p of entries) {
    const desc = p.frontmatter.description ?? "(no description)";
    lines.push(`- ${p.frontmatter.name} — ${desc}`);
    const meta: string[] = [];
    if (p.frontmatter.tags?.length) meta.push(`tags: [${p.frontmatter.tags.join(", ")}]`);
    if (p.frontmatter.language) meta.push(`language: ${p.frontmatter.language}`);
    if (p.frontmatter.year !== undefined) meta.push(`year: ${p.frontmatter.year}`);
    if (meta.length) lines.push(`  ${meta.join(", ")}`);
    lines.push(`  [ref: ${p.relativePath}]`);
  }
  lines.push(
    "",
    "These additional repos are not pre-loaded. Call `lookup_code_entries`",
    "with up to 5 of the `[ref: code/<slug>.md]` paths above to fetch their",
    "full bodies before answering questions about them.",
  );
  return lines.join("\n");
}

function renderRecommendations(kb: Kb): string {
  const lines = [`# Recommendations`, ``];
  for (const r of kb.recommendations) {
    lines.push(`## ${r.frontmatter.from} — ${r.frontmatter.title} (${r.frontmatter.date})`);
    lines.push(`[ref: ${r.relativePath}]`);
    if (r.frontmatter.relationship) lines.push(`Relationship: ${r.frontmatter.relationship}`);
    if (r.frontmatter.url) lines.push(`URL: ${r.frontmatter.url}`);
    lines.push(``, r.body, ``);
  }
  return lines.join("\n");
}

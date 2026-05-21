import type { Kb, SensitiveKb } from "./loader";

export function assemblePublicKbText(kb: Kb): string {
  const sections: string[] = [];

  sections.push(renderProfile(kb));
  sections.push(renderSkills(kb));
  sections.push(renderEducation(kb));
  sections.push(renderPublicContact(kb));
  sections.push(renderExperience(kb));
  sections.push(renderProjects(kb));

  return sections.join("\n\n");
}

// Back-compat alias — remove once /api/chat route is updated (Task 16).
export const assembleKbText = assemblePublicKbText;

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

export function assembleSensitiveKbText(sensitive: SensitiveKb): string {
  const sections: string[] = [];

  if (sensitive.salary) {
    const lines: string[] = ["# Sensitive — Salary"];
    if (sensitive.salary.expectations) lines.push(`Expectations: ${sensitive.salary.expectations}`);
    if (sensitive.salary.history?.length) {
      lines.push("", "History:");
      for (const h of sensitive.salary.history) {
        const notes = h.notes ? ` — ${h.notes}` : "";
        lines.push(`- ${h.company} (${h.period}): ${h.amount}${notes}`);
      }
    }
    lines.push("[ref: sensitive/salary.yaml.enc]");
    sections.push(lines.join("\n"));
  }

  if (sensitive.references) {
    const lines: string[] = ["# Sensitive — References"];
    for (const r of sensitive.references.entries) {
      const contact = [r.email, r.phone].filter(Boolean).join(" / ");
      lines.push(`- ${r.name} (${r.relationship})${contact ? ` — ${contact}` : ""}`);
      if (r.notes) lines.push(`  notes: ${r.notes}`);
    }
    lines.push("[ref: sensitive/references.yaml.enc]");
    sections.push(lines.join("\n"));
  }

  if (sensitive.privateContact) {
    const lines: string[] = ["# Sensitive — Private contact"];
    if (sensitive.privateContact.phone) lines.push(`Phone: ${sensitive.privateContact.phone}`);
    if (sensitive.privateContact.personalEmail) lines.push(`Personal email: ${sensitive.privateContact.personalEmail}`);
    if (sensitive.privateContact.notes) lines.push(`Notes: ${sensitive.privateContact.notes}`);
    lines.push("[ref: sensitive/private-contact.yaml.enc]");
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

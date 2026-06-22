import type { Kb } from "@/lib/kb/loader";
import type { UiLang } from "@/lib/language";
import { allRepos } from "@/lib/kb/repos";

/** Lightweight CV → markdown serializer for copy/download. Mirrors the layout
 * of `CvDocumentView`: profile header, then each section as a `##` heading
 * with bullets. Deliberately compact so the clipboard copy reads cleanly. */
export function assembleCvMarkdown(kb: Kb, lang: UiLang): string {
  const lines: string[] = [];
  lines.push(`# ${kb.profile.name}`);
  lines.push("");
  lines.push(kb.profile.headline);
  if (kb.profile.bio) lines.push(kb.profile.bio);
  if (kb.profile.location) lines.push(kb.profile.location);
  const contact: string[] = [];
  if (kb.publicContact.email) contact.push(kb.publicContact.email);
  if (kb.publicContact.links?.linkedin) contact.push(kb.publicContact.links.linkedin);
  if (kb.publicContact.links?.github) contact.push(kb.publicContact.links.github);
  if (contact.length > 0) lines.push(contact.join("  ·  "));
  lines.push("");

  if (kb.profile.achievements?.length) {
    lines.push(`## ${lang === "fr" ? "Réalisations clés" : "Selected achievements"}`);
    for (const a of kb.profile.achievements) lines.push(`- ${a}`);
    lines.push("");
  }

  const expLabel = lang === "fr" ? "Expérience" : "Experience";
  lines.push(`## ${expLabel}`);
  for (const e of kb.experience) {
    lines.push("");
    lines.push(`### ${e.frontmatter.role} · ${e.frontmatter.company}`);
    const period = `${e.frontmatter.start} – ${e.frontmatter.end}`;
    const loc = e.frontmatter.location ? ` · ${e.frontmatter.location}` : "";
    lines.push(`_${period}${loc}_`);
    if (e.frontmatter.summary) lines.push(e.frontmatter.summary);
    const bullets = e.frontmatter.highlights ?? firstBulletList(e.body, 6);
    for (const b of bullets) lines.push(`- ${b}`);
    if (e.frontmatter.stack?.length) lines.push(`*Stack: ${e.frontmatter.stack.join(", ")}*`);
  }

  if (kb.education.entries.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Formation" : "Education"}`);
    for (const ed of kb.education.entries) {
      lines.push(
        `- **${ed.degree}** · ${ed.institution} — ${ed.start} – ${ed.end}${ed.notes ? `. ${ed.notes}` : ""}`,
      );
    }
  }

  if (kb.skills.skills.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Compétences" : "Skills"}`);
    lines.push(kb.skills.skills.map((s) => s.name).join(" · "));
  }

  if (kb.projects.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Projets" : "Projects"}`);
    for (const p of kb.projects) {
      const url = p.frontmatter.url ? ` (${p.frontmatter.url})` : "";
      const year = p.frontmatter.year ? `, ${p.frontmatter.year}` : "";
      lines.push(`- **${p.frontmatter.name}**${url}${year}`);
    }
  }

  if (kb.publications.length > 0) {
    lines.push("");
    lines.push(`## Publications`);
    for (const pub of kb.publications) {
      const meta = [pub.frontmatter.authors, pub.frontmatter.venue, pub.frontmatter.year]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- **${pub.frontmatter.title}**${meta ? ` — ${meta}` : ""}`);
    }
  }

  const repos = allRepos(kb);
  if (repos.length > 0) {
    lines.push("");
    lines.push(`## Open source`);
    for (const o of repos) {
      const url = o.url ? ` (${o.url})` : "";
      lines.push(`- **${o.name}**${url} — ${o.role}${o.description ? `: ${o.description}` : ""}`);
    }
  }

  return lines.join("\n");
}

/** Slugify a person's name for a download filename: "Ada Lovelace" → "ada-lovelace". */
export function cvFileSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "cv";
}

/** Download filename for the CV markdown artifact, fr-suffixed for French. */
export function cvDownloadFilename(name: string, lang: UiLang): string {
  return `${cvFileSlug(name)}-cv${lang === "fr" ? ".fr" : ""}.md`;
}

function firstBulletList(body: string, max: number): string[] {
  const lines = body.split("\n");
  let inList = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      inList = true;
      out.push(line.replace(/^\s*[-*]\s+/, "").trim());
      if (out.length >= max) break;
    } else if (inList && line.trim() === "") {
      break;
    } else if (inList) {
      out[out.length - 1] += " " + line.trim();
    }
  }
  return out;
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Kb, KbLang } from "@/lib/kb/loader";
import { allRepos } from "@/lib/kb/repos";
import { CV_STRINGS } from "@/lib/cv/strings";

function formatMonth(date: string, locale: "en-US" | "fr-FR", presentLabel: string): string {
  if (date === "present") return presentLabel;
  const iso = date.length === 7 ? `${date}-01` : date;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
}

function formatPeriod(start: string, end: string, locale: "en-US" | "fr-FR", presentLabel: string): string {
  return `${formatMonth(start, locale, presentLabel)} – ${formatMonth(end, locale, presentLabel)}`;
}

/**
 * Pull the first bullet list out of a markdown body so the CV has CV-shaped
 * content when the author hasn't curated explicit `highlights` in frontmatter.
 */
function firstBulletList(body: string, max: number): string {
  const lines = body.split("\n");
  let inList = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      inList = true;
      out.push(line.replace(/^\s*/, ""));
      if (out.length >= max) break;
    } else if (inList && line.trim() === "") {
      break;
    } else if (inList) {
      out[out.length - 1] += " " + line.trim();
    }
  }
  return out.join("\n");
}

/** Consistent section header: an accent tick, a mono label, and a hairline rule
 * that gives every section the same opening cadence. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[1px] bg-[var(--color-accent)]" />
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.26em] text-[var(--color-text-secondary)]">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

/** A period / meta marker rendered in the same mono tertiary treatment across
 * experience, education, projects and talks. */
function MetaMarker({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
      {children}
    </span>
  );
}

export function CvDocumentView({ kb, lang }: { kb: Kb; lang: KbLang }) {
  const t = CV_STRINGS[lang];
  const fmt = (start: string, end: string) => formatPeriod(start, end, t.monthFormat, t.present);
  const repos = allRepos(kb);

  return (
    <article className="cv-page text-[var(--color-text-secondary)]">
      <header className="cv-section relative mb-9 pb-6">
        <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--color-text-primary)]">
          {kb.profile.name}
        </h1>
        {kb.profile.headline && (
          <p className="mt-1.5 font-display text-[16px] leading-snug text-[var(--color-text-secondary)]">
            {kb.profile.headline}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-[var(--color-text-tertiary)]">
          {kb.profile.location && <span>{kb.profile.location}</span>}
          {kb.publicContact.email && (
            <a
              href={`mailto:${kb.publicContact.email}`}
              className="transition-colors hover:text-[var(--color-accent)]"
            >
              {kb.publicContact.email}
            </a>
          )}
          {kb.publicContact.links?.linkedin && (
            <a
              href={kb.publicContact.links.linkedin}
              className="transition-colors hover:text-[var(--color-accent)]"
            >
              LinkedIn
            </a>
          )}
          {kb.publicContact.links?.github && (
            <a
              href={kb.publicContact.links.github}
              className="transition-colors hover:text-[var(--color-accent)]"
            >
              GitHub
            </a>
          )}
          {kb.publicContact.links?.website && (
            <a
              href={kb.publicContact.links.website}
              className="transition-colors hover:text-[var(--color-accent)]"
            >
              {kb.publicContact.links.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        {/* Accent keyline anchoring the identity block. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] w-16 rounded-full bg-[var(--color-accent)]"
        />
        <span aria-hidden className="absolute bottom-0 left-0 h-px w-full bg-[var(--color-border)]" />
      </header>

      {kb.experience.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.experience}</SectionHeading>
          <div className="flex flex-col gap-6">
            {kb.experience.map((e) => {
              const fallbackBullets = firstBulletList(e.body, 4);
              return (
                <div key={e.slug} className="cv-entry">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <h3 className="font-display text-[16px] font-semibold leading-snug text-[var(--color-text-primary)]">
                      {e.frontmatter.role}
                      <span className="text-[var(--color-text-tertiary)]"> · </span>
                      <span className="text-[var(--color-text-secondary)]">{e.frontmatter.company}</span>
                    </h3>
                    <MetaMarker>
                      {fmt(e.frontmatter.start, e.frontmatter.end)}
                      {e.frontmatter.location && <> · {e.frontmatter.location}</>}
                    </MetaMarker>
                  </div>
                  {e.frontmatter.summary && (
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                      {e.frontmatter.summary}
                    </p>
                  )}
                  {e.frontmatter.highlights && e.frontmatter.highlights.length > 0 ? (
                    <ul className="cv-prose mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                      {e.frontmatter.highlights.map((h, i) => (
                        <li key={i}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{ p: ({ children }) => <>{children}</> }}
                          >
                            {h}
                          </ReactMarkdown>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    fallbackBullets && (
                      <div className="cv-prose mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackBullets}</ReactMarkdown>
                      </div>
                    )
                  )}
                  {e.frontmatter.stack && e.frontmatter.stack.length > 0 && (
                    <p className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                      {e.frontmatter.stack.join("  ·  ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {kb.education.entries.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.education}</SectionHeading>
          <div className="flex flex-col gap-2.5">
            {kb.education.entries.map((ed, i) => (
              <div
                key={i}
                className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[14px] leading-snug"
              >
                <span>
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">
                    {ed.degree}
                  </span>
                  <span className="text-[var(--color-text-tertiary)]"> · </span>
                  <span className="text-[var(--color-text-secondary)]">{ed.institution}</span>
                  {ed.notes && <span className="text-[var(--color-text-tertiary)]"> — {ed.notes}</span>}
                </span>
                <MetaMarker>{fmt(ed.start, ed.end)}</MetaMarker>
              </div>
            ))}
          </div>
        </section>
      )}

      {kb.skills.skills.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.skills}</SectionHeading>
          <ul className="flex flex-wrap gap-x-2 gap-y-2">
            {[...kb.skills.skills]
              .sort((a, b) => b.level - a.level || b.years - a.years)
              .map((s) => (
                <li
                  key={s.name}
                  className="cv-entry rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[12px] text-[var(--color-text-secondary)]"
                >
                  {s.name}
                </li>
              ))}
          </ul>
        </section>
      )}

      {kb.projects.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.projects}</SectionHeading>
          <ul className="flex flex-col gap-2 text-[14px] leading-snug">
            {kb.projects.map((p) => (
              <li
                key={p.slug}
                className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
              >
                <span>
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">
                    {p.frontmatter.url ? (
                      <a
                        href={p.frontmatter.url}
                        className="transition-colors hover:text-[var(--color-accent)]"
                      >
                        {p.frontmatter.name}
                      </a>
                    ) : (
                      p.frontmatter.name
                    )}
                  </span>
                  {p.frontmatter.stack && p.frontmatter.stack.length > 0 && (
                    <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">
                      {"  ·  "}
                      {p.frontmatter.stack.join(" · ")}
                    </span>
                  )}
                </span>
                {p.frontmatter.year && <MetaMarker>{p.frontmatter.year}</MetaMarker>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {kb.talks.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.talks}</SectionHeading>
          <ul className="flex flex-col gap-2 text-[14px] leading-snug">
            {kb.talks.map((tk) => (
              <li
                key={tk.slug}
                className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
              >
                <span>
                  <span className="text-[var(--color-text-primary)]">
                    {tk.frontmatter.url ? (
                      <a
                        href={tk.frontmatter.url}
                        className="transition-colors hover:text-[var(--color-accent)]"
                      >
                        {tk.frontmatter.title}
                      </a>
                    ) : (
                      tk.frontmatter.title
                    )}
                  </span>
                  <span className="text-[var(--color-text-tertiary)]"> · {tk.frontmatter.venue}</span>
                </span>
                <MetaMarker>{tk.frontmatter.year}</MetaMarker>
              </li>
            ))}
          </ul>
        </section>
      )}

      {repos.length > 0 && (
        <section className="cv-section mb-4">
          <SectionHeading>{t.sections.code}</SectionHeading>
          <ul className="flex flex-col gap-2 text-[14px] leading-snug">
            {repos.map((o, i) => (
              <li key={`${o.name}-${i}`} className="cv-entry">
                {o.url ? (
                  <a
                    href={o.url}
                    className="font-display font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                  >
                    {o.name}
                  </a>
                ) : (
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">{o.name}</span>
                )}
                <span className="text-[var(--color-text-tertiary)]"> · {o.role}</span>
                {o.description && (
                  <span className="text-[var(--color-text-secondary)]"> — {o.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

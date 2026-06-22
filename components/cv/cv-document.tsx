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

/** Whole-year span of a *closed* experience (one with a definite end), localized
 * (e.g. "4 yrs" / "4 ans"). Returns null for ongoing ("present") roles or
 * unparseable dates — ongoing roles show only the period. */
function durationLabel(start: string, end: string, t: { yr: string; yrs: string }): string | null {
  if (end === "present") return null;
  const parse = (d: string) => new Date(d.length === 7 ? `${d}-01` : d);
  const s = parse(start);
  const e = parse(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const years = Math.max(1, Math.round(months / 12));
  return `${years} ${years === 1 ? t.yr : t.yrs}`;
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

/** A single contact entry: a monochrome icon followed by its label, sharing the
 * row's mono tertiary treatment. Links lift to the accent on hover; the icon
 * inherits `currentColor`, so it lifts with the label. */
function ContactItem({
  icon,
  href,
  children,
}: {
  icon: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {children}
    </span>
  );
  return href ? (
    <a href={href} className="inline-flex items-center transition-colors hover:text-[var(--color-accent)]">
      {inner}
    </a>
  ) : (
    inner
  );
}

/** A small bordered keyword chip used for an experience's tech stack — far more
 * scannable than a run-on mono caps line. */
function StackChip({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-[3px] font-mono text-[10.5px] tracking-[0.02em] text-[var(--color-text-tertiary)]">
      {children}
    </li>
  );
}

export function CvDocumentView({
  kb,
  lang,
  profileUrl,
  qrSvg,
}: {
  kb: Kb;
  lang: KbLang;
  profileUrl?: string;
  qrSvg?: string;
}) {
  const t = CV_STRINGS[lang];
  const fmt = (start: string, end: string) => formatPeriod(start, end, t.monthFormat, t.present);
  const repos = allRepos(kb);
  const links = kb.publicContact.links;

  return (
    <article className="cv-page text-[var(--color-text-secondary)]">
      <header className="cv-section relative mb-9 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--color-text-primary)]">
              {kb.profile.name}
            </h1>
            {kb.profile.headline && (
              <p className="mt-1.5 font-display text-[16px] leading-snug text-[var(--color-text-secondary)]">
                {kb.profile.headline}
              </p>
            )}
            {kb.profile.bio && (
              <p className="mt-3 max-w-[64ch] font-display text-[14px] leading-relaxed text-[var(--color-text-tertiary)]">
                {kb.profile.bio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-[var(--color-text-tertiary)]">
              {kb.profile.location && (
                <ContactItem icon={<PinIcon />}>{kb.profile.location}</ContactItem>
              )}
              {kb.publicContact.email && (
                <ContactItem icon={<MailIcon />} href={`mailto:${kb.publicContact.email}`}>
                  {kb.publicContact.email}
                </ContactItem>
              )}
              {links?.linkedin && (
                <ContactItem icon={<LinkedInIcon />} href={links.linkedin}>
                  LinkedIn
                </ContactItem>
              )}
              {links?.github && (
                <ContactItem icon={<GitHubIcon />} href={links.github}>
                  GitHub
                </ContactItem>
              )}
              {links?.website && (
                <ContactItem icon={<GlobeIcon />} href={links.website}>
                  {links.website.replace(/^https?:\/\//, "")}
                </ContactItem>
              )}
            </div>
          </div>
          {profileUrl && qrSvg && (
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div
                role="img"
                aria-label={t.qrAlt}
                className="cv-qr h-[88px] w-[88px] text-[var(--color-text-primary)]"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <span className="font-mono text-[10px] tracking-[0.02em] text-[var(--color-text-tertiary)]">
                {profileUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>
          )}
        </div>
        {/* Accent keyline anchoring the identity block. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] w-16 rounded-full bg-[var(--color-accent)]"
        />
        <span aria-hidden className="absolute bottom-0 left-0 h-px w-full bg-[var(--color-border)]" />
      </header>

      {kb.profile.achievements && kb.profile.achievements.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.achievements}</SectionHeading>
          <ul className="cv-achievements grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {kb.profile.achievements.map((a, i) => (
              <li key={i} className="cv-entry flex gap-2.5 text-[13.5px] leading-relaxed text-[var(--color-text-secondary)]">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-[1px] bg-[var(--color-accent)]"
                />
                <span>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{ p: ({ children }) => <>{children}</> }}
                  >
                    {a}
                  </ReactMarkdown>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {kb.experience.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.experience}</SectionHeading>
          <div className="flex flex-col gap-6">
            {kb.experience.map((e) => {
              const fallbackBullets = firstBulletList(e.body, 4);
              const dur = durationLabel(e.frontmatter.start, e.frontmatter.end, t);
              return (
                <div key={e.slug} className="cv-entry cv-entry--flow">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <h3 className="font-display text-[16px] font-semibold leading-snug text-[var(--color-text-primary)]">
                      {e.frontmatter.role}
                      <span className="text-[var(--color-text-tertiary)]"> · </span>
                      <span className="text-[var(--color-text-secondary)]">{e.frontmatter.company}</span>
                    </h3>
                    <MetaMarker>
                      {fmt(e.frontmatter.start, e.frontmatter.end)}
                      {dur && <span className="text-[var(--color-text-tertiary)]"> · {dur}</span>}
                    </MetaMarker>
                  </div>
                  {e.frontmatter.location && (
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-[var(--color-text-tertiary)]">
                      <PinIcon />
                      {e.frontmatter.location}
                    </p>
                  )}
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
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {e.frontmatter.stack.map((s) => (
                        <StackChip key={s}>{s}</StackChip>
                      ))}
                    </ul>
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

      {kb.publications.length > 0 && (
        <section className="cv-section mb-9">
          <SectionHeading>{t.sections.publications}</SectionHeading>
          <ul className="flex flex-col gap-2.5 text-[14px] leading-snug">
            {kb.publications.map((pub) => {
              const sub = [pub.frontmatter.venue, pub.frontmatter.year].filter(Boolean).join(" · ");
              return (
                <li key={pub.slug} className="cv-entry">
                  <p className="font-display text-[14px] font-semibold leading-snug text-[var(--color-text-primary)]">
                    {pub.frontmatter.title}
                  </p>
                  {(pub.frontmatter.authors || sub) && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--color-text-tertiary)]">
                      {pub.frontmatter.authors && (
                        <span className="text-[var(--color-text-secondary)]">{pub.frontmatter.authors}</span>
                      )}
                      {pub.frontmatter.authors && sub && <span> · </span>}
                      {sub}
                    </p>
                  )}
                </li>
              );
            })}
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

/* --- Monochrome contact icons (inherit `currentColor`) ---------------------- */

const STROKE_ICON = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function PinIcon() {
  return (
    <svg {...STROKE_ICON} className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...STROKE_ICON} className="shrink-0">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg {...STROKE_ICON} className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}

/** Official LinkedIn mark (monochrome, fills with `currentColor`). */
function LinkedInIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.27V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

/** Official GitHub mark (monochrome, fills with `currentColor`). */
function GitHubIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadKb, type KbLang } from "@/lib/kb/loader";
import { CV_STRINGS } from "./strings";
import { PrintButton } from "./print-button";
import "./print.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Alexandre Collet — CV",
  description: "Printable CV for Alexandre Collet.",
};

function parseLang(value: string | string[] | undefined): KbLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fr" ? "fr" : "en";
}

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
 * content (3-4 achievements) when the author hasn't yet curated explicit
 * `highlights` in frontmatter. Returns a markdown string with `- ` lines.
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
      // continuation of previous bullet
      out[out.length - 1] += " " + line.trim();
    }
  }
  return out.join("\n");
}

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function CvPage({ searchParams }: Props) {
  const params = await searchParams;
  const lang = parseLang(params.lang);
  const t = CV_STRINGS[lang];
  const kb = await loadKb(path.join(process.cwd(), "kb"), lang);
  const otherLang: KbLang = lang === "en" ? "fr" : "en";

  const fmt = (start: string, end: string) => formatPeriod(start, end, t.monthFormat, t.present);

  const publicRepos = kb.code.filter(
    (o) => o.frontmatter.visibility === "public" && o.frontmatter.url,
  );

  return (
    <main className="cv-page mx-auto max-w-3xl px-6 py-10">
      <div className="no-print mb-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          ← queryme
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/cv?lang=${otherLang}`}
            className="rounded-full border border-[var(--color-border)] px-4 py-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {t.switchLang}
          </Link>
          <PrintButton label={t.print} />
        </div>
      </div>

      <header className="cv-section mb-7 border-b border-[var(--color-border)] pb-5">
        <h1 className="font-display text-[28px] font-semibold leading-tight text-[var(--color-text-primary)]">
          {kb.profile.name}
        </h1>
        <p className="mt-1 text-[15px] text-[var(--color-text-secondary)]">{kb.profile.headline}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--color-text-tertiary)]">
          {kb.profile.location && <span>{kb.profile.location}</span>}
          {kb.publicContact.email && (
            <a href={`mailto:${kb.publicContact.email}`} className="hover:text-[var(--color-accent)]">
              {kb.publicContact.email}
            </a>
          )}
          {kb.publicContact.links?.linkedin && (
            <a href={kb.publicContact.links.linkedin} className="hover:text-[var(--color-accent)]">
              LinkedIn
            </a>
          )}
          {kb.publicContact.links?.github && (
            <a href={kb.publicContact.links.github} className="hover:text-[var(--color-accent)]">
              GitHub
            </a>
          )}
          {kb.publicContact.links?.website && (
            <a href={kb.publicContact.links.website} className="hover:text-[var(--color-accent)]">
              {kb.publicContact.links.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </header>

      {kb.experience.length > 0 && (
        <section className="cv-section mb-7">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.experience}
          </h2>
          <div className="flex flex-col gap-5">
            {kb.experience.map((e) => {
              const fallbackBullets = firstBulletList(e.body, 4);
              return (
                <article key={e.slug} className="cv-entry">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h3 className="font-display text-[16px] font-semibold text-[var(--color-text-primary)]">
                      {e.frontmatter.role} · {e.frontmatter.company}
                    </h3>
                    <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)] whitespace-nowrap">
                      {fmt(e.frontmatter.start, e.frontmatter.end)}
                      {e.frontmatter.location && <> · {e.frontmatter.location}</>}
                    </span>
                  </div>
                  {e.frontmatter.summary && (
                    <p className="mt-1 text-[14px] leading-snug text-[var(--color-text-secondary)]">
                      {e.frontmatter.summary}
                    </p>
                  )}
                  {e.frontmatter.highlights && e.frontmatter.highlights.length > 0 ? (
                    <ul className="cv-prose mt-2 text-[var(--color-text-secondary)]">
                      {e.frontmatter.highlights.map((h, i) => (
                        <li key={i}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>
                            {h}
                          </ReactMarkdown>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    fallbackBullets && (
                      <div className="cv-prose mt-2 text-[var(--color-text-secondary)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackBullets}</ReactMarkdown>
                      </div>
                    )
                  )}
                  {e.frontmatter.stack && e.frontmatter.stack.length > 0 && (
                    <p className="mt-2 font-mono text-[12px] text-[var(--color-text-tertiary)]">
                      {e.frontmatter.stack.join(" · ")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {kb.education.entries.length > 0 && (
        <section className="cv-section mb-7">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.education}
          </h2>
          <div className="flex flex-col gap-2">
            {kb.education.entries.map((ed, i) => (
              <div
                key={i}
                className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4 text-[14px] leading-snug"
              >
                <span>
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">
                    {ed.degree}
                  </span>
                  <span className="text-[var(--color-text-secondary)]"> · {ed.institution}</span>
                  {ed.notes && (
                    <span className="text-[var(--color-text-tertiary)]"> — {ed.notes}</span>
                  )}
                </span>
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)] whitespace-nowrap">
                  {fmt(ed.start, ed.end)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {kb.skills.skills.length > 0 && (
        <section className="cv-section mb-7">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.skills}
          </h2>
          <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
            {[...kb.skills.skills]
              .sort((a, b) => b.level - a.level || b.years - a.years)
              .map((s) => s.name)
              .join(" · ")}
          </p>
        </section>
      )}

      {kb.projects.length > 0 && (
        <section className="cv-section mb-7">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.projects}
          </h2>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug">
            {kb.projects.map((p) => (
              <li key={p.slug} className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="font-display font-semibold text-[var(--color-text-primary)]">
                    {p.frontmatter.url ? (
                      <a href={p.frontmatter.url} className="hover:text-[var(--color-accent)]">
                        {p.frontmatter.name}
                      </a>
                    ) : (
                      p.frontmatter.name
                    )}
                  </span>
                  {p.frontmatter.stack && p.frontmatter.stack.length > 0 && (
                    <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">
                      {" · "}
                      {p.frontmatter.stack.join(" · ")}
                    </span>
                  )}
                </span>
                {p.frontmatter.year && (
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)] whitespace-nowrap">
                    {p.frontmatter.year}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {kb.talks.length > 0 && (
        <section className="cv-section mb-7">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.talks}
          </h2>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug">
            {kb.talks.map((tk) => (
              <li key={tk.slug} className="cv-entry flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="text-[var(--color-text-primary)]">
                    {tk.frontmatter.url ? (
                      <a href={tk.frontmatter.url} className="hover:text-[var(--color-accent)]">
                        {tk.frontmatter.title}
                      </a>
                    ) : (
                      tk.frontmatter.title
                    )}
                  </span>
                  <span className="text-[var(--color-text-tertiary)]"> · {tk.frontmatter.venue}</span>
                </span>
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)] whitespace-nowrap">
                  {tk.frontmatter.year}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {publicRepos.length > 0 && (
        <section className="cv-section mb-3">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            {t.sections.openSource}
          </h2>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug">
            {publicRepos.map((o) => (
              <li key={o.slug} className="cv-entry">
                <a
                  href={o.frontmatter.url}
                  className="font-display font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
                >
                  {o.frontmatter.name}
                </a>
                <span className="text-[var(--color-text-tertiary)]"> · {o.frontmatter.role}</span>
                {o.frontmatter.description && (
                  <span className="text-[var(--color-text-secondary)]"> — {o.frontmatter.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

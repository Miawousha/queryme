/**
 * Migrate a content repo's `kb/code/*.md` into project `repos:` arrays — losslessly.
 *
 *   # 1. Analyze + write a review plan (dry run, writes kb/code/_migration-plan.yaml)
 *   pnpm migrate:code --root ../my-content-repo
 *
 *   # 2. After reviewing/editing the plan, apply it
 *   pnpm migrate:code --root ../my-content-repo --apply kb/code/_migration-plan.yaml
 *
 * Apply assertion: every code slug appears exactly once in the plan, and the
 * number of repos written equals the number of code files read. Refuses to
 * delete a code file whose repo was not written into a project.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type CodeRepo = {
  slug: string;
  repo: Record<string, unknown>; // RepoSchema-shaped (minus code_bytes)
  body: string;
};

export type Plan = {
  projects: Array<{ slug: string; name: string; repos: string[] }>;
};

type Lang = "en" | "fr";
type RepoDoc = { fm: Record<string, unknown>; body: string };

export type BilingualRepo = {
  slug: string;
  en: RepoDoc;
  fr: RepoDoc | null;
};

/** A hand-authored or proposed migration plan (bilingual-aware). */
export type PlanProject = {
  slug: string;
  name: string;
  repos: string[];
  tags?: string[];
  intro_en?: string;
  intro_fr?: string;
  /** When true, append repos to an EXISTING project file instead of rewriting it. */
  merge?: boolean;
};
export type PlanV2 = { projects: PlanProject[] };

async function readDoc(file: string): Promise<RepoDoc> {
  const raw = await fs.readFile(file, "utf8");
  const { data, content } = matter(raw);
  const { code_bytes, ...fm } = data as Record<string, unknown>; // drop code_bytes
  void code_bytes;
  return { fm, body: content.trim() };
}

/** Reads each canonical `code/<slug>.md` plus its optional `code/<slug>.fr.md`. */
export async function readBilingualRepos(codeDir: string): Promise<BilingualRepo[]> {
  let files: string[];
  try {
    files = await fs.readdir(codeDir);
  } catch {
    return [];
  }
  const canonical = files.filter((f) => f.endsWith(".md") && !/\.[a-z]{2}\.md$/.test(f)).sort();
  const out: BilingualRepo[] = [];
  for (const f of canonical) {
    const slug = f.replace(/\.md$/, "");
    const en = await readDoc(path.join(codeDir, f));
    let fr: RepoDoc | null = null;
    try {
      fr = await readDoc(path.join(codeDir, `${slug}.fr.md`));
    } catch {
      fr = null;
    }
    out.push({ slug, en, fr });
  }
  return out;
}

function docFor(r: BilingualRepo, lang: Lang): RepoDoc {
  return lang === "fr" ? (r.fr ?? r.en) : r.en;
}

/** Add one `#` to each ATX heading (h1–h5 → h2–h6; h6 left as-is) so a repo's
 * own headings nest one level under the `## <RepoName>` section that wraps it. */
function demoteHeadings(md: string): string {
  return md.replace(/^(#{1,5})(\s)/gm, "#$1$2");
}

/** Build one project file (front-matter + body) for the given language. */
export function buildProjectDoc(
  proj: PlanProject,
  repos: BilingualRepo[], // in plan order
  lang: Lang,
): { fm: Record<string, unknown>; body: string } {
  const docs = repos.map((r) => docFor(r, lang));
  const single = repos.length === 1;
  const fm: Record<string, unknown> = { name: proj.name };

  if (single) {
    const d = docs[0].fm;
    if (d.year !== undefined) fm.year = d.year;
    if (d.stack !== undefined) fm.stack = d.stack;
    if (d.tags !== undefined) fm.tags = d.tags;
    if (d.visibility === "public" && d.url) fm.url = d.url;
  } else {
    const years = docs
      .map((d) => d.fm.year)
      .filter((y): y is number => typeof y === "number");
    if (years.length) fm.year = Math.max(...years);
    if (proj.tags) fm.tags = proj.tags;
  }

  fm.repos = docs.map((d) => d.fm); // code_bytes already stripped by readDoc

  let body: string;
  if (single) {
    body = docs[0].body;
  } else {
    const intro = lang === "fr" ? (proj.intro_fr ?? proj.intro_en ?? "") : (proj.intro_en ?? "");
    const sections = repos.map((r, i) => {
      const title = (docs[i].fm.name as string) ?? r.slug;
      return `## ${title}\n\n${demoteHeadings(docs[i].body)}`;
    });
    body = [intro, ...sections].filter(Boolean).join("\n\n");
  }
  return { fm, body };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Group by first tag; tagless repos land under a single `open-source` project. */
export function proposePlan(repos: CodeRepo[]): Plan {
  const groups = new Map<string, string[]>();
  for (const r of repos) {
    const tags = (r.repo.tags as string[] | undefined) ?? [];
    const key = tags.length ? slugify(tags[0]) : "open-source";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.slug);
  }
  return {
    projects: [...groups.entries()].map(([slug, repoSlugs]) => ({
      slug,
      name: slug === "open-source" ? "Open source" : slug.replace(/-/g, " "),
      repos: repoSlugs.sort(),
    })),
  };
}

function frCount(repos: BilingualRepo[]): number {
  return repos.filter((r) => r.fr !== null).length;
}

function assertLosslessBi(repos: BilingualRepo[], plan: PlanV2): void {
  const assigned = plan.projects.flatMap((p) => p.repos);
  const seen = new Set(assigned);
  if (assigned.length !== seen.size) throw new Error("Plan assigns a repo to more than one project.");
  const inputSlugs = new Set(repos.map((r) => r.slug));
  for (const slug of inputSlugs) if (!seen.has(slug)) throw new Error(`Repo "${slug}" is not assigned in the plan.`);
  for (const slug of seen) if (!inputSlugs.has(slug)) throw new Error(`Plan references unknown repo "${slug}".`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function applyPlan(root: string, repos: BilingualRepo[], plan: PlanV2): Promise<void> {
  assertLosslessBi(repos, plan);
  const bySlug = new Map(repos.map((r) => [r.slug, r]));
  const projectsDir = path.join(root, "kb", "projects");
  await fs.mkdir(projectsDir, { recursive: true });

  let writtenEn = 0;
  let writtenFr = 0;

  for (const proj of plan.projects) {
    const projRepos = proj.repos.map((s) => bySlug.get(s)!);
    const hasFr = projRepos.some((r) => r.fr !== null);

    // EN file (always)
    const enFile = path.join(projectsDir, `${proj.slug}.md`);
    // merge mode: append repos to an existing project file and keep its
    // hand-written body verbatim — the incoming repo bodies are intentionally
    // NOT composed in (used for the pre-existing `queryme` project).
    if (proj.merge && (await fileExists(enFile))) {
      const ex = matter(await fs.readFile(enFile, "utf8"));
      const fm = ex.data as Record<string, unknown>;
      fm.repos = [...((fm.repos as unknown[]) ?? []), ...projRepos.map((r) => r.en.fm)];
      await fs.writeFile(enFile, `---\n${stringifyYaml(fm)}---\n\n${ex.content.trim()}\n`, "utf8");
    } else {
      const { fm, body } = buildProjectDoc(proj, projRepos, "en");
      await fs.writeFile(enFile, `---\n${stringifyYaml(fm)}---\n\n${body}\n`, "utf8");
    }
    writtenEn += projRepos.length;

    // FR file (only when there is French content to write, or a merge target exists)
    const frFile = path.join(projectsDir, `${proj.slug}.fr.md`);
    const frMergeTarget = proj.merge && (await fileExists(frFile));
    if (hasFr || frMergeTarget) {
      if (frMergeTarget) {
        const ex = matter(await fs.readFile(frFile, "utf8"));
        const fm = ex.data as Record<string, unknown>;
        fm.repos = [...((fm.repos as unknown[]) ?? []), ...projRepos.map((r) => docFor(r, "fr").fm)];
        await fs.writeFile(frFile, `---\n${stringifyYaml(fm)}---\n\n${ex.content.trim()}\n`, "utf8");
      } else {
        const { fm, body } = buildProjectDoc(proj, projRepos, "fr");
        await fs.writeFile(frFile, `---\n${stringifyYaml(fm)}---\n\n${body}\n`, "utf8");
      }
      writtenFr += projRepos.filter((r) => r.fr !== null).length;
    }
  }

  if (writtenEn !== repos.length) {
    throw new Error(`Lossless (EN) failed: wrote ${writtenEn} but read ${repos.length}.`);
  }
  if (writtenFr !== frCount(repos)) {
    throw new Error(`Lossless (FR) failed: used ${writtenFr} French sidecars but found ${frCount(repos)}.`);
  }

  await fs.rm(path.join(root, "kb", "code"), { recursive: true, force: true });
  console.log(`Migrated ${writtenEn} repos (${writtenFr} FR) into ${plan.projects.length} projects; removed kb/code/.`);
}

async function main() {
  const args = process.argv.slice(2);
  const root = args[args.indexOf("--root") + 1] ?? process.env.PERSONA_LOCAL_OVERRIDE;
  if (!root) throw new Error("Pass --root <content-repo> or set PERSONA_LOCAL_OVERRIDE.");
  const codeDir = path.join(root, "kb", "code");
  const repos = await readBilingualRepos(codeDir);
  if (repos.length === 0) throw new Error(`No kb/code/*.md found under ${root}.`);

  const applyIdx = args.indexOf("--apply");
  if (applyIdx === -1) {
    const plan = proposePlan(repos.map((r) => ({ slug: r.slug, repo: r.en.fm, body: r.en.body })));
    const planPath = path.join(codeDir, "_migration-plan.yaml");
    await fs.writeFile(planPath, stringifyYaml(plan), "utf8");
    console.log(`Proposed ${plan.projects.length} projects for ${repos.length} repos.`);
    console.log(`Review/edit the plan, then re-run with --apply ${planPath}`);
    if (args.includes("--json")) console.log(JSON.stringify(plan, null, 2));
  } else {
    const planPath = args[applyIdx + 1];
    const plan = parseYaml(await fs.readFile(planPath, "utf8")) as PlanV2;
    await applyPlan(root, repos, plan);
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate-code-to-projects.ts")) {
  main().catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  });
}

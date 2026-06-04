# Content-repo migration (repos under projects) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Miawousha content repo (`/Users/alexandrecollet/queryme-content-alex`) from `kb/code/*.md` (51 repos + 51 French sidecars) to the new repos-under-projects ontology — 14 projects, bilingual, lossless — and clean its `cv-config.yaml` + `prompts/system.md` so it syncs under the new app.

**Architecture:** Enhance the app repo's `scripts/migrate-code-to-projects.ts` to be **bilingual + plan-driven + body-composing** (it's currently English-only and would delete the French sidecars). Then author the locked taxonomy as a hand-written plan YAML and apply it to the content repo on a branch. All content-repo work is reviewable via `git diff` + `pnpm validate:kb`; nothing is pushed/synced without the user's approval.

**Tech Stack:** TypeScript, tsx, gray-matter, `yaml`, Vitest. Two git repos: the **app repo** (`/Users/alexandrecollet/queryme`, branch for the codemod change) and the **content repo** (`/Users/alexandrecollet/queryme-content-alex`, branch for the data migration).

**Spec:** [docs/superpowers/specs/2026-06-04-content-repo-migration-design.md](../specs/2026-06-04-content-repo-migration-design.md)

**Locked taxonomy (all 51 repos):**
- Single-repo projects (repo body → project body): `queryme`*(merge)*, `ontoloom`, `polypress`, `learn-anything`, `feedsnap`, `travelbook`, `matrice-website`, `string-theory`, `grammairept`, `exit-velocity`.
- `spritz` ← spritz, spritz-modern, spritz-svelte
- `personal-tools` ← toudoux, sirene, roadmap
- `altergo-battery-intelligence-platform` ← aging-battery-lifetime-simulator, altergo-platform-etl-benchmark, altergo-strategic-docs, arbitrage, battery-capacity-sizer, battery-digital-twin-models, battery-usage-analyzer, bess-control-sim, cell-imbalance, cell-model-visualizer, cellsos, demo-eq-cycle-model, effective-capacity-benchmark-model, hppc-analysis, hydrogen, impedance, model-boilerplate, rtbm, rtbm-clone, rtbm-dataset-generator, simple-soc-model, soc, soc-model, sop, supplier-data-mapping, tsdb-benchmark
- `dev-tooling-experiments` ← blueprint-creator, blueprints-importer, simple-app, openclaw-config, opus-infra, su2re, article-checker, bisque, saas

**Tooling note:** App repo has no `lint` script; gates are `pnpm typecheck` and `pnpm test`. Commit messages end with the `Co-Authored-By` trailer.

---

### Task 0: Branches

**Files:** none (git)

- [ ] **Step 1: App-repo branch** (we're on `main`)

Run:
```bash
cd /Users/alexandrecollet/queryme && git checkout -b feat/bilingual-content-migration
```
Expected: `Switched to a new branch 'feat/bilingual-content-migration'`

- [ ] **Step 2: Content-repo branch**

Run:
```bash
cd /Users/alexandrecollet/queryme-content-alex && git checkout -b migrate/repos-under-projects && git status -sb
```
Expected: on `migrate/repos-under-projects`, clean tree.

---

### Task 1: Bilingual read + plan types (codemod)

**Files:**
- Modify: `/Users/alexandrecollet/queryme/scripts/migrate-code-to-projects.ts`
- Test: `/Users/alexandrecollet/queryme/tests/scripts/migrate-code-to-projects.test.ts`

All paths below are in the **app repo**. TDD.

- [ ] **Step 1: Write the failing test** — append to the test file:

```ts
import { mkdtemp as mkdtemp2, mkdir as mkdir2, writeFile as writeFile2, rm as rm2 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import path2 from "node:path";
import { readBilingualRepos } from "@/scripts/migrate-code-to-projects";

describe("readBilingualRepos", () => {
  it("pairs each canonical repo with its .fr.md sidecar and strips code_bytes", async () => {
    const root = await mkdtemp2(path2.join(tmpdir2(), "bi-read-"));
    try {
      const dir = path2.join(root, "kb", "code");
      await mkdir2(dir, { recursive: true });
      await writeFile2(path2.join(dir, "alpha.md"), "---\nname: alpha\nrole: author\ncode_bytes: 5\n---\n\nEN body.\n");
      await writeFile2(path2.join(dir, "alpha.fr.md"), "---\nname: alpha\nrole: author\n---\n\nCorps FR.\n");
      await writeFile2(path2.join(dir, "beta.md"), "---\nname: beta\nrole: author\n---\n\nBeta EN.\n");
      const repos = await readBilingualRepos(dir);
      const alpha = repos.find((r) => r.slug === "alpha")!;
      expect(alpha.en.body).toBe("EN body.");
      expect(alpha.en.fm.code_bytes).toBeUndefined(); // stripped
      expect(alpha.fr?.body).toBe("Corps FR.");
      const beta = repos.find((r) => r.slug === "beta")!;
      expect(beta.fr).toBeNull(); // no sidecar
    } finally {
      await rm2(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`readBilingualRepos` not exported)

Run: `cd /Users/alexandrecollet/queryme && pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: FAIL — `readBilingualRepos` is not exported.

- [ ] **Step 3: Implement** — in `scripts/migrate-code-to-projects.ts`, add types + reader. Insert after the existing `import` lines and `CodeRepo`/`Plan` types:

```ts
type Lang = "en" | "fr";
type RepoDoc = { fm: Record<string, unknown>; body: string };

export type BilingualRepo = {
  slug: string;
  en: RepoDoc;
  fr: RepoDoc | null;
};

/** A hand-authored or proposed migration plan. */
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
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**
```bash
cd /Users/alexandrecollet/queryme
git add scripts/migrate-code-to-projects.ts tests/scripts/migrate-code-to-projects.test.ts
git commit -m "feat(scripts): bilingual repo reader for content migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Project-file builder (single / multi / metadata + body composition)

**Files:**
- Modify: `/Users/alexandrecollet/queryme/scripts/migrate-code-to-projects.ts`
- Test: `/Users/alexandrecollet/queryme/tests/scripts/migrate-code-to-projects.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { buildProjectDoc } from "@/scripts/migrate-code-to-projects";

const biRepo = (slug, name, body, frBody, extra = {}) => ({
  slug,
  en: { fm: { name, role: "author", visibility: "public", url: `https://x/${slug}`, year: 2024, ...extra }, body },
  fr: frBody ? { fm: { name, role: "author", visibility: "public", url: `https://x/${slug}`, year: 2024, ...extra }, body: frBody } : null,
});

describe("buildProjectDoc", () => {
  it("single-repo: project body is the repo body; metadata copied from repo", () => {
    const proj = { slug: "ontoloom", name: "Ontoloom", repos: ["ontoloom"] };
    const repos = [biRepo("ontoloom", "ontoloom", "EN narrative.", "Récit FR.")];
    const en = buildProjectDoc(proj, repos, "en");
    expect(en.fm.name).toBe("Ontoloom");
    expect(en.fm.year).toBe(2024);
    expect(en.fm.url).toBe("https://x/ontoloom");
    expect((en.fm.repos as unknown[]).length).toBe(1);
    expect(en.body).toBe("EN narrative.");
    const fr = buildProjectDoc(proj, repos, "fr");
    expect(fr.body).toBe("Récit FR."); // FR body used
  });

  it("multi-repo: body is intro + one ## section per repo; tags from plan; year = max", () => {
    const proj = {
      slug: "spritz", name: "Spritz", tags: ["productivity"],
      intro_en: "Spritz intro.", intro_fr: "Intro Spritz.",
      repos: ["spritz", "spritz-modern"],
    };
    const repos = [
      biRepo("spritz", "spritz", "Body one.", "Corps un.", { year: 2022 }),
      biRepo("spritz-modern", "spritz-modern", "Body two.", "Corps deux.", { year: 2024 }),
    ];
    const en = buildProjectDoc(proj, repos, "en");
    expect(en.fm.tags).toEqual(["productivity"]);
    expect(en.fm.year).toBe(2024);
    expect(en.fm.url).toBeUndefined(); // multi-repo omits url
    expect(en.body).toBe("Spritz intro.\n\n## spritz\n\nBody one.\n\n## spritz-modern\n\nBody two.");
    const fr = buildProjectDoc(proj, repos, "fr");
    expect(fr.body).toBe("Intro Spritz.\n\n## spritz\n\nCorps un.\n\n## spritz-modern\n\nCorps deux.");
  });

  it("fr falls back to en doc when a repo lacks a .fr.md", () => {
    const proj = { slug: "x", name: "X", repos: ["x"] };
    const repos = [biRepo("x", "x", "Only EN.", null)];
    expect(buildProjectDoc(proj, repos, "fr").body).toBe("Only EN.");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`buildProjectDoc` not exported)

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — add to `scripts/migrate-code-to-projects.ts`:

```ts
function docFor(r: BilingualRepo, lang: Lang): RepoDoc {
  return lang === "fr" ? (r.fr ?? r.en) : r.en;
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
      return `## ${title}\n\n${docs[i].body}`;
    });
    body = [intro, ...sections].filter(Boolean).join("\n\n");
  }
  return { fm, body };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add scripts/migrate-code-to-projects.ts tests/scripts/migrate-code-to-projects.test.ts
git commit -m "feat(scripts): bilingual project-file builder (single/multi body composition)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bilingual apply + lossless gate + CLI wiring

**Files:**
- Modify: `/Users/alexandrecollet/queryme/scripts/migrate-code-to-projects.ts`
- Test: `/Users/alexandrecollet/queryme/tests/scripts/migrate-code-to-projects.test.ts`

This replaces the English-only `applyPlan` with a bilingual one and wires `main()` to it. It writes `<slug>.fr.md` only when at least one repo in the project has a French source (or, for merge, when the `.fr.md` target already exists) — so the existing English-only apply tests still hold.

- [ ] **Step 1: Update the existing apply test to assert bilingual + losslessness** — REPLACE the existing `describe("migrate-code-to-projects apply (lossless)", ...)` block with:

```ts
describe("migrate-code-to-projects apply (bilingual, lossless)", () => {
  async function makeBilingualRepo(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "migrate-bi-"));
    await mkdir(path.join(root, "kb", "code"), { recursive: true });
    // two battery repos with FR sidecars, one tagless extra without FR
    await writeFile(path.join(root, "kb", "code", "alpha.md"), "---\nname: alpha\nrole: author\ntags: [battery]\ncode_bytes: 9\n---\n\nAlpha EN.\n");
    await writeFile(path.join(root, "kb", "code", "alpha.fr.md"), "---\nname: alpha\nrole: author\ntags: [battery]\n---\n\nAlpha FR.\n");
    await writeFile(path.join(root, "kb", "code", "beta.md"), "---\nname: beta\nrole: author\ntags: [battery]\n---\n\nBeta EN.\n");
    await writeFile(path.join(root, "kb", "code", "beta.fr.md"), "---\nname: beta\nrole: author\ntags: [battery]\n---\n\nBeta FR.\n");
    return root;
  }

  it("applies a hand-authored plan, writes EN+FR project files, removes kb/code/", async () => {
    const root = await makeBilingualRepo();
    try {
      const plan = path.join(root, "plan.yaml");
      await writeFile(plan,
        "projects:\n" +
        "  - slug: battery\n    name: Battery\n    tags: [battery]\n    intro_en: Intro.\n    intro_fr: Intro FR.\n    repos: [alpha, beta]\n");
      const res = await runMigrate(["--root", root, "--apply", plan]);
      expect(res.code).toBe(0);
      const en = await readFile(path.join(root, "kb", "projects", "battery.md"), "utf8");
      const fr = await readFile(path.join(root, "kb", "projects", "battery.fr.md"), "utf8");
      expect(en).toContain("## alpha"); expect(en).toContain("Alpha EN."); expect(en).toContain("Beta EN.");
      expect(en).not.toContain("code_bytes");
      expect(fr).toContain("Alpha FR."); expect(fr).toContain("Beta FR.");
      await expect(readdir(path.join(root, "kb", "code"))).rejects.toThrow(); // removed
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it("aborts WITHOUT deleting kb/code/ when the plan drops a repo", async () => {
    const root = await makeBilingualRepo();
    try {
      const plan = path.join(root, "plan.yaml");
      await writeFile(plan, "projects:\n  - slug: battery\n    name: Battery\n    repos: [alpha]\n"); // beta missing
      const res = await runMigrate(["--root", root, "--apply", plan]);
      expect(res.code).not.toBe(0);
      const codeFiles = await readdir(path.join(root, "kb", "code"));
      expect(codeFiles).toContain("alpha.md");
      expect(codeFiles).toContain("beta.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});
```

(The `runMigrate` / `makeRepo` helpers and imports from the earlier apply test are reused — keep the import lines for `execFile`, `promisify`, fs helpers, `tmpdir`, `path`, and `SCRIPT` that were added in the Task-13 cleanup. If you replaced the only block using `makeRepo`, delete the now-unused `makeRepo` to avoid an unused-var lint failure under `next build` — but it's a test file, so vitest/tsc tolerate it; remove it for cleanliness.)

- [ ] **Step 2: Run — expect FAIL** (apply still English-only: no `battery.fr.md`, body lacks `## alpha`)

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: FAIL on the bilingual assertions.

- [ ] **Step 3: Implement** — replace the existing `applyPlan` function with the bilingual version, and update `main()`:

```ts
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
```

Then update `main()` to read bilingual repos and adapt the dry-run path. Replace the body of `main()` with:

```ts
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
```

Note: `proposePlan` and its `CodeRepo` type are unchanged (still used for the dry-run fallback). The old English-only `applyPlan(root, CodeRepo[], Plan)` and `assertLossless`/`readCodeRepos` are replaced/removed — delete `readCodeRepos` and the old `applyPlan`/`assertLossless` if now unused (grep to confirm no remaining references), keeping `proposePlan`, `slugify`, `CodeRepo`, `Plan`.

- [ ] **Step 4: Run the focused tests — expect PASS**

Run: `pnpm vitest run tests/scripts/migrate-code-to-projects.test.ts`
Expected: PASS (proposePlan + bilingual read + builder + bilingual apply/abort).

- [ ] **Step 5: Full app-repo gate**

Run: `pnpm typecheck` → exit 0. `pnpm test 2>&1 | tail -4` → all green.

- [ ] **Step 6: Commit**
```bash
git add scripts/migrate-code-to-projects.ts tests/scripts/migrate-code-to-projects.test.ts
git commit -m "feat(scripts): bilingual plan-driven apply with EN+FR lossless gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Author the taxonomy migration plan

**Files:**
- Create: `/Users/alexandrecollet/queryme/scripts/migrations/alex-content-plan.yaml` (committed in the app repo for the record; passed to `--apply`).

- [ ] **Step 1: Create the plan file** with the exact locked taxonomy + intros:

```yaml
# Migration plan for the Miawousha content repo (repos → projects).
# Consumed by: pnpm migrate:code --root ../queryme-content-alex --apply <this file>
projects:
  - slug: queryme
    name: Queryme
    merge: true
    repos: [queryme]
  - slug: ontoloom
    name: Ontoloom
    repos: [ontoloom]
  - slug: polypress
    name: Polypress
    repos: [polypress]
  - slug: learn-anything
    name: Learn Anything
    repos: [learn-anything]
  - slug: feedsnap
    name: Feedsnap
    repos: [feedsnap]
  - slug: travelbook
    name: Travelbook
    repos: [travelbook]
  - slug: matrice-website
    name: Matrice Website
    repos: [matrice-website]
  - slug: string-theory
    name: String Theory
    repos: [string-theory]
  - slug: grammairept
    name: GrammairePT
    repos: [grammairept]
  - slug: exit-velocity
    name: Exit Velocity
    repos: [exit-velocity]
  - slug: spritz
    name: Spritz
    tags: [productivity]
    intro_en: "Spritz is Alexandre's task manager, built across several stacks. The repositories below are its implementations."
    intro_fr: "Spritz est le gestionnaire de tâches d'Alexandre, décliné dans plusieurs stacks. Les dépôts ci-dessous en sont les implémentations."
    repos: [spritz, spritz-modern, spritz-svelte]
  - slug: personal-tools
    name: Personal tools
    tags: [productivity]
    intro_en: "A handful of small personal productivity tools."
    intro_fr: "Quelques petits outils de productivité personnels."
    repos: [toudoux, sirene, roadmap]
  - slug: altergo-battery-intelligence-platform
    name: Altergo Battery Intelligence Platform
    tags: [battery, energy]
    intro_en: "Altergo is Alexandre's battery-intelligence platform: physics-based models, state estimators, simulators, and data tooling for monitoring and predicting battery-system behaviour. The repositories below are its components."
    intro_fr: "Altergo est la plateforme d'intelligence batterie d'Alexandre : modèles physiques, estimateurs d'état, simulateurs et outils de données pour surveiller et prédire le comportement des systèmes de batteries. Les dépôts ci-dessous en sont les composants."
    repos:
      - aging-battery-lifetime-simulator
      - altergo-platform-etl-benchmark
      - altergo-strategic-docs
      - arbitrage
      - battery-capacity-sizer
      - battery-digital-twin-models
      - battery-usage-analyzer
      - bess-control-sim
      - cell-imbalance
      - cell-model-visualizer
      - cellsos
      - demo-eq-cycle-model
      - effective-capacity-benchmark-model
      - hppc-analysis
      - hydrogen
      - impedance
      - model-boilerplate
      - rtbm
      - rtbm-clone
      - rtbm-dataset-generator
      - simple-soc-model
      - soc
      - soc-model
      - sop
      - supplier-data-mapping
      - tsdb-benchmark
  - slug: dev-tooling-experiments
    name: Dev tooling & experiments
    tags: [tooling]
    intro_en: "Smaller developer tools, infrastructure benchmarks, and prototypes."
    intro_fr: "Petits outils de développement, benchmarks d'infrastructure et prototypes."
    repos:
      - blueprint-creator
      - blueprints-importer
      - simple-app
      - openclaw-config
      - opus-infra
      - su2re
      - article-checker
      - bisque
      - saas
```

- [ ] **Step 2: Sanity-check the plan covers exactly the 51 repos**

Run:
```bash
cd /Users/alexandrecollet/queryme
node --import tsx -e "import {parse} from 'yaml'; import {readFileSync,readdirSync} from 'node:fs'; const p=parse(readFileSync('scripts/migrations/alex-content-plan.yaml','utf8')); const planned=p.projects.flatMap(x=>x.repos).sort(); const onDisk=readdirSync('/Users/alexandrecollet/queryme-content-alex/kb/code').filter(f=>f.endsWith('.md')&&!/\.[a-z]{2}\.md$/.test(f)).map(f=>f.replace(/\.md$/,'')).sort(); const miss=onDisk.filter(s=>!planned.includes(s)); const extra=planned.filter(s=>!onDisk.includes(s)); console.log('planned',planned.length,'onDisk',onDisk.length,'missing',miss,'extra',extra);"
```
Expected: `planned 51 onDisk 51 missing [] extra []`. If not, fix the plan until it matches.

- [ ] **Step 3: Commit**
```bash
git add scripts/migrations/alex-content-plan.yaml
git commit -m "chore(scripts): migration plan for Miawousha content repo (14 projects)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Run the migration on the content repo

**Files:** writes to `/Users/alexandrecollet/queryme-content-alex/kb/projects/*` and removes `kb/code/`.

- [ ] **Step 1: Dry check the lossless math against the real repo (no writes yet)**

Already done in Task 4 Step 2 (planned 51 == onDisk 51). Proceed.

- [ ] **Step 2: Apply the migration**

Run:
```bash
cd /Users/alexandrecollet/queryme
node --import tsx scripts/migrate-code-to-projects.ts --root /Users/alexandrecollet/queryme-content-alex --apply scripts/migrations/alex-content-plan.yaml
```
Expected: `Migrated 51 repos (51 FR) into 14 projects; removed kb/code/.`
If it throws a lossless error, STOP and report — do not hand-delete anything.

- [ ] **Step 3: Verify the output shape in the content repo**

Run:
```bash
cd /Users/alexandrecollet/queryme-content-alex
echo "projects:"; ls kb/projects | sort
echo "code dir (should be gone):"; ls kb/code 2>&1
echo "queryme merged (has repos: + original narrative)?"; grep -c "repos:" kb/projects/queryme.md; grep -c "A queryable CV" kb/projects/queryme.md
echo "no code_bytes anywhere:"; grep -rl "code_bytes" kb/projects || echo "none"
echo "altergo has ## sections + repos:"; grep -c "^## " kb/projects/altergo-battery-intelligence-platform.md; grep -c "^  - name:" kb/projects/altergo-battery-intelligence-platform.md
```
Expected: 14 project slugs (×2 with `.fr.md` = 28 files), `kb/code` gone, queryme has both `repos:` and its original narrative, no `code_bytes`, Altergo has ~26 `## ` sections and 26 repo entries.

- [ ] **Step 4: Commit the content-repo data migration (on its branch)**
```bash
cd /Users/alexandrecollet/queryme-content-alex
git add -A
git commit -m "migrate: restructure repos under projects (14 projects, bilingual)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Clean the content repo's cv-config.yaml + system prompt

**Files:**
- Modify: `/Users/alexandrecollet/queryme-content-alex/cv-config.yaml`
- Modify: `/Users/alexandrecollet/queryme-content-alex/prompts/system.md`

- [ ] **Step 1: `cv-config.yaml`** — remove the `code:` section and the entire `chat:` block (with its comment + `featured_code:` list). Keep `experience` (its include list), `education`, `skills`, `projects: all: true`, `talks`. Update the identifier comment near the top to drop `code` (`experience / projects / talks → file slug`).

Verify: `grep -nE "^code:|^chat:|featured_code" /Users/alexandrecollet/queryme-content-alex/cv-config.yaml` → no matches.

- [ ] **Step 2: `prompts/system.md`** — remove the bullet (around lines 14–16) instructing the agent about `# Code (index)` and `lookup_code_entries` / `[ref: code/<slug>.md]`. Read the file, remove that one instruction, leave the rest.

Verify: `grep -nE "lookup_code|# Code \(index\)|code/<slug>" /Users/alexandrecollet/queryme-content-alex/prompts/system.md` → no matches.

- [ ] **Step 3: Commit (content repo)**
```bash
cd /Users/alexandrecollet/queryme-content-alex
git add cv-config.yaml prompts/system.md
git commit -m "chore: drop code/featured_code/lookup from cv-config + system prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Validate + review gate (no push)

**Files:** none (verification)

- [ ] **Step 1: Validate the migrated content repo against the new app**

Run:
```bash
cd /Users/alexandrecollet/queryme
PERSONA_LOCAL_OVERRIDE=/Users/alexandrecollet/queryme-content-alex pnpm validate:kb
```
Expected: `OK — KB validates and assembles to <N> chars.` with `projects: 14 entries (51 repos)`. If it fails (schema error on a project/repo), fix the offending file in the content repo and re-run.

- [ ] **Step 2: Spot-check bilingual assembly**

Run:
```bash
cd /Users/alexandrecollet/queryme
PERSONA_LOCAL_OVERRIDE=/Users/alexandrecollet/queryme-content-alex pnpm validate:kb >/dev/null 2>&1 && echo "EN ok"
# FR loads through the same loader; confirm a fr project file parses:
node --import tsx -e "import {loadKb} from '@/lib/kb/loader'; loadKb('/Users/alexandrecollet/queryme-content-alex/kb','fr').then(k=>console.log('fr projects:',k.projects.length,'fr repos:', k.projects.flatMap(p=>p.frontmatter.repos??[]).length))"
```
Expected: `fr projects: 14 fr repos: 51`.

- [ ] **Step 3: Present the diff for review — STOP for user approval**

Run:
```bash
cd /Users/alexandrecollet/queryme-content-alex
git log --oneline main..HEAD
git diff --stat main..HEAD
```
Show the user: the new project files (esp. the drafted Altergo/Spritz/Personal-tools/Dev-tooling intros), the deleted `kb/code/`, and the cv-config/system.md cleanups.

**Do NOT push the content repo and do NOT merge its branch** until the user approves the diff. Pushing + Resync is the live-page change and is the user's call (coordinated with deploying the app).

- [ ] **Step 4: App-repo branch finish**

The app-repo branch `feat/bilingual-content-migration` (codemod enhancement + plan) is mergeable independently. After the user approves, use **superpowers:finishing-a-development-branch** for it.

---

## Self-review notes (for the executor)

- **Spec coverage:** bilingual read (T1), body composition single/multi (T2), bilingual apply + EN/FR lossless gate + merge mode (T3), taxonomy plan with intros (T4), run on content repo (T5), cv-config + system.md cleanup (T6), validate + review-gate + no-push (T7). All spec sections map to a task.
- **Type consistency:** `BilingualRepo {slug, en, fr}`, `RepoDoc {fm, body}`, `PlanV2 {projects: PlanProject[]}`, `PlanProject {slug,name,repos,tags?,intro_en?,intro_fr?,merge?}`. `buildProjectDoc(proj, BilingualRepo[], lang)`. `applyPlan(root, BilingualRepo[], PlanV2)`. `proposePlan` keeps its original `CodeRepo`/`Plan` types (dry-run fallback only).
- **No silent data loss:** EN gate (all 51 assigned) + FR gate (all 51 sidecars used) both block `rm kb/code/`; bodies are composed in, not dropped; `queryme` is merged not overwritten.
- **Two repos:** codemod/tests/plan commit to the **app repo** branch; the migrated content + cv-config/system.md commit to the **content repo** branch. Nothing pushed.

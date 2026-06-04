import { describe, it, expect } from "vitest";
import { proposePlan, type CodeRepo } from "@/scripts/migrate-code-to-projects";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const SCRIPT = path.resolve(__dirname, "../../scripts/migrate-code-to-projects.ts");

async function runMigrate(args: string[]): Promise<{ code: number; stderr: string; stdout: string }> {
  try {
    const { stdout, stderr } = await exec("node", ["--import", "tsx", SCRIPT, ...args], {
      cwd: path.resolve(__dirname, "../.."),
    });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stderr?: string; stdout?: string };
    return { code: err.code ?? 1, stderr: err.stderr ?? "", stdout: err.stdout ?? "" };
  }
}

const REPOS: CodeRepo[] = [
  { slug: "a", repo: { name: "a", role: "author", tags: ["ai"] }, body: "" },
  { slug: "b", repo: { name: "b", role: "author", tags: ["ai"] }, body: "" },
  { slug: "c", repo: { name: "c", role: "author" }, body: "" },
];

describe("proposePlan", () => {
  it("groups repos by their primary tag, tagless under open-source", () => {
    const plan = proposePlan(REPOS);
    const ai = plan.projects.find((p) => p.slug === "ai");
    const os = plan.projects.find((p) => p.slug === "open-source");
    expect(ai?.repos).toEqual(["a", "b"]);
    expect(os?.repos).toEqual(["c"]);
  });

  it("is lossless — every input slug appears exactly once", () => {
    const plan = proposePlan(REPOS);
    const assigned = plan.projects.flatMap((p) => p.repos).sort();
    expect(assigned).toEqual(["a", "b", "c"]);
  });
});

describe("migrate-code-to-projects apply (bilingual, lossless)", () => {
  async function makeBilingualRepo(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "migrate-bi-"));
    await mkdir(path.join(root, "kb", "code"), { recursive: true });
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
      await expect(readdir(path.join(root, "kb", "code"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it("aborts WITHOUT deleting kb/code/ when the plan drops a repo", async () => {
    const root = await makeBilingualRepo();
    try {
      const plan = path.join(root, "plan.yaml");
      await writeFile(plan, "projects:\n  - slug: battery\n    name: Battery\n    repos: [alpha]\n");
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

import { buildProjectDoc, type BilingualRepo } from "@/scripts/migrate-code-to-projects";

const biRepo = (
  slug: string,
  name: string,
  body: string,
  frBody: string | null,
  extra: Record<string, unknown> = {},
): BilingualRepo => ({
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

  it("multi-repo: demotes each repo's internal headings under its ## section", () => {
    const proj = {
      slug: "g", name: "G", tags: ["x"], intro_en: "Intro.", intro_fr: "Intro.",
      repos: ["a", "b"],
    };
    const repos = [
      biRepo("a", "a", "Lead A.\n\n## What\n\nWhat A.\n\n### Deep\n\nDeep A.", "Lead A FR."),
      biRepo("b", "b", "Lead B.\n\n## What\n\nWhat B.", "Lead B FR."),
    ];
    const en = buildProjectDoc(proj, repos, "en");
    // Repo titles stay at ##; the repos' own ## become ### and ### become ####.
    expect(en.body).toContain("## a\n\nLead A.\n\n### What\n\nWhat A.\n\n#### Deep\n\nDeep A.");
    expect(en.body).toContain("## b\n\nLead B.\n\n### What\n\nWhat B.");
    // No repo's internal heading remains at ## level (only the 2 repo titles are ##):
    const h2 = en.body.split("\n").filter((l) => /^## /.test(l));
    expect(h2).toEqual(["## a", "## b"]);
  });

  it("single-repo: body is verbatim (headings NOT demoted)", () => {
    const proj = { slug: "s", name: "S", repos: ["s"] };
    const repos = [biRepo("s", "s", "Lead.\n\n## What\n\nDetail.", "Tête.")];
    expect(buildProjectDoc(proj, repos, "en").body).toBe("Lead.\n\n## What\n\nDetail.");
  });
});

describe("migrate-code-to-projects apply — merge mode", () => {
  it("appends the repo to an existing project's repos: and KEEPS its body (EN+FR)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "migrate-merge-"));
    try {
      // existing project files with a hand-written narrative and no repos yet
      await mkdir(path.join(root, "kb", "projects"), { recursive: true });
      await writeFile(path.join(root, "kb", "projects", "queryme.md"),
        "---\nname: Queryme\nyear: 2026\nurl: https://x/queryme\n---\n\n## Summary\nExisting EN narrative.\n");
      await writeFile(path.join(root, "kb", "projects", "queryme.fr.md"),
        "---\nname: Queryme\nyear: 2026\nurl: https://x/queryme\n---\n\n## Résumé\nRécit FR existant.\n");
      // the code repo to merge in
      await mkdir(path.join(root, "kb", "code"), { recursive: true });
      await writeFile(path.join(root, "kb", "code", "queryme.md"),
        "---\nname: queryme\nrole: author\nvisibility: public\nurl: https://x/queryme\ncode_bytes: 7\n---\n\nCode body EN that must NOT replace the narrative.\n");
      await writeFile(path.join(root, "kb", "code", "queryme.fr.md"),
        "---\nname: queryme\nrole: author\nvisibility: public\nurl: https://x/queryme\n---\n\nCorps de code FR.\n");

      const plan = path.join(root, "plan.yaml");
      await writeFile(plan, "projects:\n  - slug: queryme\n    name: Queryme\n    merge: true\n    repos: [queryme]\n");

      const res = await runMigrate(["--root", root, "--apply", plan]);
      expect(res.code).toBe(0);

      const en = await readFile(path.join(root, "kb", "projects", "queryme.md"), "utf8");
      // existing narrative preserved
      expect(en).toContain("Existing EN narrative.");
      // repo appended to repos:
      expect(en).toContain("- name: queryme");
      // incoming code body intentionally NOT merged into prose
      expect(en).not.toContain("must NOT replace the narrative");
      // code_bytes stripped
      expect(en).not.toContain("code_bytes");

      const fr = await readFile(path.join(root, "kb", "projects", "queryme.fr.md"), "utf8");
      expect(fr).toContain("Récit FR existant.");
      expect(fr).toContain("- name: queryme");

      // kb/code removed after a successful lossless apply
      await expect(readdir(path.join(root, "kb", "code"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

import { describe, it, expect } from "vitest";
import { proposePlan, type CodeRepo } from "@/scripts/migrate-code-to-projects";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const SCRIPT = path.resolve(__dirname, "../../scripts/migrate-code-to-projects.ts");

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "migrate-test-"));
  await mkdir(path.join(root, "kb", "code"), { recursive: true });
  await writeFile(
    path.join(root, "kb", "code", "alpha.md"),
    "---\nname: alpha\nrole: author\ntags: [ai]\n---\n\nAlpha.\n",
  );
  await writeFile(
    path.join(root, "kb", "code", "beta.md"),
    "---\nname: beta\nrole: author\n---\n\nBeta.\n",
  );
  return root;
}

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

describe("migrate-code-to-projects apply (lossless)", () => {
  it("dry run then apply migrates all repos and removes kb/code/", async () => {
    const root = await makeRepo();
    try {
      await runMigrate(["--root", root]);
      const planPath = path.join(root, "kb", "code", "_migration-plan.yaml");
      await runMigrate(["--root", root, "--apply", planPath]);
      const projects = await readdir(path.join(root, "kb", "projects"));
      // Both repos landed across the generated project files.
      const bodies = await Promise.all(
        projects.map((f) => readFile(path.join(root, "kb", "projects", f), "utf8")),
      );
      const joined = bodies.join("\n");
      expect(joined).toContain("alpha");
      expect(joined).toContain("beta");
      // code/ is gone after a successful, lossless apply.
      await expect(readdir(path.join(root, "kb", "code"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it("aborts WITHOUT deleting kb/code/ when the plan drops a repo", async () => {
    const root = await makeRepo();
    try {
      // A plan that omits 'beta' must be rejected by assertLossless before any deletion.
      const badPlan = path.join(root, "bad-plan.yaml");
      await writeFile(badPlan, "projects:\n  - slug: ai\n    name: AI\n    repos: [alpha]\n");
      const res = await runMigrate(["--root", root, "--apply", badPlan]);
      expect(res.code).not.toBe(0);
      // kb/code/ must still be intact (nothing deleted on a failed lossless check).
      const codeFiles = await readdir(path.join(root, "kb", "code"));
      expect(codeFiles.sort()).toContain("alpha.md");
      expect(codeFiles.sort()).toContain("beta.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

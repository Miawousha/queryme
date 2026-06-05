import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { filterKbForCv, loadCvConfig } from "@/lib/kb/cv-config";
import { allRepos } from "@/lib/kb/repos";
import type { Kb, ProjectEntry } from "@/lib/kb/loader";
import type { Repo } from "@/lib/kb/schemas";

async function withTmpDir<T>(yaml: string | null, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-config-test-"));
  try {
    if (yaml !== null) await fs.writeFile(path.join(dir, "cv-config.yaml"), yaml, "utf8");
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("loadCvConfig", () => {
  it("parses section filters", async () => {
    await withTmpDir(`projects:\n  all: true\nexperience:\n  include:\n    - a\n`, async (dir) => {
      const cfg = await loadCvConfig(dir);
      expect(cfg?.projects).toEqual({ all: true });
      expect(cfg?.experience).toEqual({ include: ["a"] });
    });
  });

  it("rejects an unknown top-level key (strict schema)", async () => {
    await expect(
      withTmpDir(`chat:\n  featured_code:\n    - x\n`, (dir) => loadCvConfig(dir)),
    ).rejects.toThrow();
  });

  it("returns null when the file is absent", async () => {
    await withTmpDir(null, async (dir) => {
      expect(await loadCvConfig(dir)).toBeNull();
    });
  });
});

function repo(overrides: Partial<Repo> & Pick<Repo, "name">): Repo {
  return { role: "author", visibility: "public", ...overrides };
}

function project(slug: string, repos: Repo[]): ProjectEntry {
  return { slug, relativePath: `projects/${slug}.md`, frontmatter: { name: slug, repos }, body: "" };
}

function kbWithProjects(projects: ProjectEntry[]): Kb {
  return {
    profile: { name: "Test", headline: "Dev" },
    skills: { skills: [] },
    education: { entries: [] },
    publicContact: {},
    experience: [],
    projects,
    talks: [],
    recommendations: [],
  };
}

describe("filterKbForCv repo privacy", () => {
  const mixed = () =>
    kbWithProjects([
      project("alpha", [
        repo({ name: "pub", visibility: "public", url: "https://github.com/x/pub" }),
        repo({ name: "secret", visibility: "private", url: "https://github.com/x/secret", description: "internal" }),
        repo({ name: "pub-no-url", visibility: "public" }),
      ]),
    ]);

  it("drops private repos even when there is no cv-config", () => {
    const cvKb = filterKbForCv(mixed(), null);
    const names = (cvKb.projects[0].frontmatter.repos ?? []).map((r) => r.name);
    expect(names).toEqual(["pub"]);
    expect(names).not.toContain("secret");
  });

  it("drops private repos when a cv-config is present", () => {
    const cvKb = filterKbForCv(mixed(), { projects: { all: true } });
    const names = (cvKb.projects[0].frontmatter.repos ?? []).map((r) => r.name);
    expect(names).toEqual(["pub"]);
  });

  it("yields only public repos through allRepos (the leak vector)", () => {
    const cvKb = filterKbForCv(mixed(), null);
    expect(allRepos(cvKb).map((r) => r.name)).toEqual(["pub"]);
    expect(allRepos(cvKb).every((r) => r.visibility === "public" && r.url)).toBe(true);
  });
});

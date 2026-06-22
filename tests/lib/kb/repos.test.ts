import { describe, it, expect } from "vitest";
import { projectLink } from "@/lib/kb/repos";
import type { ProjectEntry } from "@/lib/kb/loader";
import type { Repo } from "@/lib/kb/schemas";

function repo(overrides: Partial<Repo> & Pick<Repo, "name">): Repo {
  return { role: "author", visibility: "public", ...overrides };
}

function project(frontmatter: ProjectEntry["frontmatter"]): ProjectEntry {
  return { slug: frontmatter.name, relativePath: `projects/${frontmatter.name}.md`, frontmatter, body: "" };
}

describe("projectLink", () => {
  it("prefers the author's canonical frontmatter url", () => {
    const p = project({
      name: "Queritae",
      url: "https://queritae.com",
      repos: [repo({ name: "queryme", visibility: "public", url: "https://github.com/x/queryme" })],
    });
    expect(projectLink(p)).toBe("https://queritae.com");
  });

  it("falls back to the first public, linkable repo url when there is no frontmatter url", () => {
    const p = project({
      name: "Altergo",
      repos: [
        repo({ name: "private-core", visibility: "private", url: "https://github.com/x/private-core" }),
        repo({ name: "public-sdk", visibility: "public", url: "https://github.com/x/public-sdk" }),
        repo({ name: "public-cli", visibility: "public", url: "https://github.com/x/public-cli" }),
      ],
    });
    expect(projectLink(p)).toBe("https://github.com/x/public-sdk");
  });

  it("never returns a private repo url, even when it is the only repo with a url", () => {
    const p = project({
      name: "Graybox",
      repos: [repo({ name: "graybox", visibility: "private", url: "https://github.com/x/graybox" })],
    });
    expect(projectLink(p)).toBeUndefined();
  });

  it("ignores a public repo that has no url", () => {
    const p = project({
      name: "Ontoloom",
      repos: [repo({ name: "ontoloom", visibility: "public" })],
    });
    expect(projectLink(p)).toBeUndefined();
  });

  it("returns undefined when the project has neither a url nor any repos", () => {
    expect(projectLink(project({ name: "Bare" }))).toBeUndefined();
  });
});

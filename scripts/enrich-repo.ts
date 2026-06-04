/**
 * Enrich a single GitHub repo into a paste-ready `repos:` YAML block for a
 * project's front-matter. Replaces the old bulk importer.
 *
 *   pnpm enrich:repo <owner/name | https://github.com/owner/name> [--role author|maintainer|contributor]
 *
 * Prints a YAML list item (two-space indented) to stdout. Pipe or copy it under
 * a project's `repos:` key.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractReadmeParagraph,
  buildPublicFrontmatter,
  type GhRepo,
  type RepoRole,
} from "./lib/github-repos";

const exec = promisify(execFile);

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function parseTarget(arg: string): string {
  const m = arg.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  const slug = m ? m[1] : arg;
  if (!/^[^/]+\/[^/]+$/.test(slug)) {
    throw new Error(`Expected "owner/name" or a github.com URL, got: ${arg}`);
  }
  return slug;
}

function lastActiveFromPushedAt(pushedAt: string): string | undefined {
  const d = new Date(pushedAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toYaml(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`    ${k}: [${v.map((x) => JSON.stringify(x)).join(", ")}]`);
    } else if (typeof v === "string") {
      lines.push(`    ${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`    ${k}: ${v}`);
    }
  }
  // First key becomes the list item ("- name: ...").
  lines[0] = lines[0].replace(/^ {4}/, "  - ");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("Usage: pnpm enrich:repo <owner/name | url> [--role author|maintainer|contributor]");
    process.exit(1);
  }
  const roleArg = args[args.indexOf("--role") + 1];
  const role: RepoRole =
    roleArg === "maintainer" || roleArg === "contributor" ? roleArg : "author";

  const slug = parseTarget(target);
  const json = await gh([
    "repo", "view", slug,
    "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
  ]);
  const repo = JSON.parse(json) as GhRepo;

  const fm = buildPublicFrontmatter(repo, role);
  let body: string | null = null;
  if (!repo.isPrivate) {
    try {
      const readme = await gh(["api", `repos/${slug}/readme`, "--jq", ".content"]);
      body = extractReadmeParagraph(Buffer.from(readme.trim(), "base64").toString("utf8"));
    } catch { /* no readme */ }
  }

  const yaml = toYaml({
    name: fm.name,
    role: fm.role,
    visibility: repo.isPrivate ? "private" : "public",
    url: repo.isPrivate ? undefined : fm.url,
    description: fm.description ?? body ?? undefined,
    language: fm.language,
    year: fm.year,
    last_active: lastActiveFromPushedAt(repo.pushedAt),
    stars: repo.isPrivate ? undefined : fm.stars,
    archived: fm.archived ? true : undefined,
    tags: fm.tags,
  });

  console.log(yaml);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

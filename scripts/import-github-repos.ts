import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  slugifyRepoName,
  extractReadmeParagraph,
  buildPublicFrontmatter,
  buildPrivateFrontmatter,
  type GhRepo,
  type RepoFm,
} from "./lib/github-repos";

const exec = promisify(execFile);
const GH_USER = "Miawousha";
const KB_DIR = path.resolve(process.cwd(), "kb/code");
const FORCE = process.argv.includes("--force");

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

async function checkGhAuth(): Promise<void> {
  try {
    await exec("gh", ["auth", "status"]);
  } catch {
    console.error("FAIL: gh CLI is not authenticated. Run `gh auth login` and retry.");
    process.exit(1);
  }
}

async function listOwnedRepos(): Promise<GhRepo[]> {
  const stdout = await gh([
    "repo", "list", GH_USER,
    "--limit", "500",
    "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
  ]);
  const repos = JSON.parse(stdout) as GhRepo[];
  return repos.filter((r) => !r.isFork);
}

type PrSearchResult = { repository: { nameWithOwner: string; isPrivate: boolean; url: string } };

async function listContributedRepos(): Promise<string[]> {
  // Returns owner/name strings for distinct PUBLIC repos Alex has merged PRs into,
  // excluding repos he owns (covered by listOwnedRepos).
  const stdout = await gh([
    "search", "prs",
    "--author", GH_USER,
    "--merged",
    "--limit", "500",
    "--json", "repository",
  ]);
  const prs = JSON.parse(stdout) as PrSearchResult[];
  const seen = new Set<string>();
  for (const pr of prs) {
    const { nameWithOwner, isPrivate } = pr.repository;
    if (isPrivate) continue;
    if (nameWithOwner.startsWith(`${GH_USER}/`)) continue;
    seen.add(nameWithOwner);
  }
  return [...seen].sort();
}

async function fetchReadme(ownerSlashName: string): Promise<string | null> {
  try {
    const stdout = await gh(["api", `repos/${ownerSlashName}/readme`, "--jq", ".content"]);
    return Buffer.from(stdout.trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function fetchRepoMeta(ownerSlashName: string): Promise<GhRepo | null> {
  try {
    const stdout = await gh([
      "repo", "view", ownerSlashName,
      "--json", "name,description,url,isPrivate,isArchived,isFork,primaryLanguage,stargazerCount,repositoryTopics,createdAt,pushedAt",
    ]);
    return JSON.parse(stdout) as GhRepo;
  } catch {
    return null;
  }
}

function frontmatterToYaml(fm: RepoFm): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${JSON.stringify(fm.name)}`);
  if (fm.url) lines.push(`url: ${fm.url}`);
  lines.push(`role: ${fm.role}`);
  lines.push(`visibility: ${fm.visibility}`);
  if (fm.description) lines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.year !== undefined) lines.push(`year: ${fm.year}`);
  if (fm.language) lines.push(`language: ${JSON.stringify(fm.language)}`);
  if (fm.stars !== undefined) lines.push(`stars: ${fm.stars}`);
  if (fm.archived !== undefined) lines.push(`archived: ${fm.archived}`);
  if (fm.tags?.length) lines.push(`tags: [${fm.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
  lines.push("---", "");
  return lines.join("\n");
}

async function writeEntry(slug: string, fm: RepoFm, body: string, needsSanitization: boolean): Promise<"wrote" | "skipped"> {
  const file = path.join(KB_DIR, `${slug}.md`);
  if (!FORCE) {
    try {
      await fs.access(file);
      return "skipped";
    } catch { /* missing → write */ }
  }
  const todo = needsSanitization
    ? "<!-- TODO: sanitize — auto-imported from private repo, review before commit -->\n\n"
    : "";
  const content = frontmatterToYaml(fm) + todo + body + "\n";
  await fs.writeFile(file, content, "utf8");

  // French sidecar stub (only if missing — never overwrite)
  const frFile = path.join(KB_DIR, `${slug}.fr.md`);
  try {
    await fs.access(frFile);
  } catch {
    await fs.writeFile(frFile, content, "utf8");
  }
  return "wrote";
}

async function main() {
  await checkGhAuth();
  await fs.mkdir(KB_DIR, { recursive: true });

  console.log(`Fetching owned repos for ${GH_USER}...`);
  const owned = await listOwnedRepos();
  console.log(`  → ${owned.length} non-fork repos (${owned.filter((r) => r.isPrivate).length} private)`);

  console.log("Fetching contributed-to public repos...");
  const contributedNames = await listContributedRepos();
  console.log(`  → ${contributedNames.length} unique non-owned repos`);

  let wrote = 0;
  let skipped = 0;
  let privateCount = 0;

  // Owned repos
  for (const repo of owned) {
    const slug = slugifyRepoName(repo.name);
    let body: string;
    let fm: RepoFm;
    let needsSanitization = false;

    if (repo.isPrivate) {
      fm = buildPrivateFrontmatter(repo);
      body = repo.description ?? "No description available.";
      needsSanitization = true;
      privateCount++;
    } else {
      fm = buildPublicFrontmatter(repo, "author");
      const readme = await fetchReadme(`${GH_USER}/${repo.name}`);
      const para = readme ? extractReadmeParagraph(readme) : null;
      body = para ?? repo.description ?? "No description available.";
    }

    const result = await writeEntry(slug, fm, body, needsSanitization);
    if (result === "wrote") wrote++;
    else skipped++;
  }

  // Contributed-to repos
  for (const nameWithOwner of contributedNames) {
    const repo = await fetchRepoMeta(nameWithOwner);
    if (!repo) {
      console.warn(`  ! could not fetch meta for ${nameWithOwner}, skipping`);
      continue;
    }
    const slug = slugifyRepoName(repo.name);
    const fm = buildPublicFrontmatter(repo, "contributor");
    const readme = await fetchReadme(nameWithOwner);
    const para = readme ? extractReadmeParagraph(readme) : null;
    const body = para ?? repo.description ?? "No description available.";
    const result = await writeEntry(slug, fm, body, false);
    if (result === "wrote") wrote++;
    else skipped++;
  }

  console.log(`\nDone. Wrote ${wrote} entries, skipped ${skipped} existing.`);
  if (privateCount > 0) {
    console.log(`${privateCount} private entries written — search for "TODO: sanitize" in kb/code/ and review before committing.`);
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

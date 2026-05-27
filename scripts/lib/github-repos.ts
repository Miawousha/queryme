export type GhRepo = {
  name: string;
  description: string | null;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  repositoryTopics: { name: string }[] | null;
  createdAt: string;
  pushedAt: string;
};

export type RepoRole = "author" | "maintainer" | "contributor";

export type RepoFm = {
  name: string;
  url?: string;
  role: RepoRole;
  visibility: "public" | "private";
  description?: string;
  year?: number;
  language?: string;
  stars?: number;
  archived?: boolean;
  tags?: string[];
};

export function slugifyRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BADGE_RE = /!\[[^\]]*\]\([^)]+\)/g;
const HTML_TAG_RE = /<[^>]+>/g;

function cleanParagraph(p: string): string {
  return p.replace(BADGE_RE, "").replace(HTML_TAG_RE, "").replace(/\s+/g, " ").trim();
}

const BOILERPLATE_RES = [
  /create-next-app/i,
  /^this is a \[?next\.js/i,
];

function isListParagraph(p: string): boolean {
  const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((l) => /^([-*+]|\d+\.)\s/.test(l));
}

function isBoilerplate(p: string): boolean {
  return BOILERPLATE_RES.some((re) => re.test(p));
}

export function extractReadmeParagraph(md: string): string | null {
  if (!md.trim()) return null;
  const paragraphs = md.split(/\n\s*\n/);
  for (const raw of paragraphs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (isListParagraph(trimmed)) continue;
    const cleaned = cleanParagraph(trimmed);
    if (!cleaned) continue;
    if (isBoilerplate(cleaned)) continue;
    return cleaned;
  }
  return null;
}

function pickYear(createdAt: string): number {
  return new Date(createdAt).getUTCFullYear();
}

export function buildPublicFrontmatter(repo: GhRepo, role: RepoRole): RepoFm {
  const fm: RepoFm = {
    name: repo.name,
    url: repo.url,
    role,
    visibility: "public",
    year: pickYear(repo.createdAt),
    stars: repo.stargazerCount,
    archived: repo.isArchived,
  };
  if (repo.description) fm.description = repo.description;
  if (repo.primaryLanguage?.name) fm.language = repo.primaryLanguage.name;
  const tags = (repo.repositoryTopics ?? []).map((t) => t.name).filter(Boolean);
  if (tags.length) fm.tags = tags;
  return fm;
}

export function buildPrivateFrontmatter(repo: GhRepo): RepoFm {
  const fm: RepoFm = {
    name: repo.name,
    role: "author",
    visibility: "private",
    year: pickYear(repo.createdAt),
    archived: repo.isArchived,
  };
  if (repo.description) fm.description = repo.description;
  if (repo.primaryLanguage?.name) fm.language = repo.primaryLanguage.name;
  const tags = (repo.repositoryTopics ?? []).map((t) => t.name).filter(Boolean);
  if (tags.length) fm.tags = tags;
  return fm;
}

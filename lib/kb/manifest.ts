import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fileTypeFromPath, type KbFileType } from "@/lib/kb/file-type";

/**
 * Frontmatter fields surfaced to the UI. A loose superset of the experience
 * and project frontmatter shapes — every field is optional, so a file only
 * carries the keys it actually defines.
 */
export type KbFileMeta = {
  company?: string;
  role?: string;
  start?: string;
  end?: string;
  location?: string;
  year?: number;
  url?: string;
  stack?: string[];
  tags?: string[];
  /** Repo-specific fields surfaced for the code section of the KB panel. */
  visibility?: "public" | "private";
  language?: string;
  stars?: number;
};

export type KbFile = {
  /** Path relative to the kb directory, e.g. "experience/2025-altergo.md". */
  path: string;
  /** Human-readable title for the file list. */
  title: string;
  type: KbFileType;
  /** Parsed frontmatter, present only for markdown files that have any. */
  meta?: KbFileMeta;
};

/** Directory name under kb/ that is never exposed by the manifest. */
const EXCLUDED_DIR = "sensitive";

/** Humanizes a path's basename into a fallback title. */
function humanize(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  const stem = base.replace(/\.[^.]+$/, "");
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const strs = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return strs.length > 0 ? strs : undefined;
}

/** Picks the known, UI-relevant frontmatter keys; returns null if none are present. */
function asVisibility(v: unknown): "public" | "private" | undefined {
  return v === "public" || v === "private" ? v : undefined;
}

function pickMeta(data: Record<string, unknown>): KbFileMeta | null {
  const meta: KbFileMeta = {
    company: asString(data.company),
    role: asString(data.role),
    start: asString(data.start),
    end: asString(data.end),
    location: asString(data.location),
    year: asNumber(data.year),
    url: asString(data.url),
    stack: asStringArray(data.stack),
    tags: asStringArray(data.tags),
    visibility: asVisibility(data.visibility),
    language: asString(data.language),
    stars: asNumber(data.stars),
  };
  const hasAny = Object.values(meta).some((v) => v !== undefined);
  return hasAny ? meta : null;
}

/**
 * Reads a markdown file once: derives the title (first `# Heading`, falling
 * back to the humanized path) and the parsed frontmatter.
 */
async function readMarkdown(
  absPath: string,
  relPath: string,
): Promise<{ title: string; meta?: KbFileMeta }> {
  const raw = await fs.readFile(absPath, "utf8");
  const { data, content } = matter(raw);
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : humanize(relPath);
  const meta = pickMeta(data as Record<string, unknown>);
  return meta ? { title, meta } : { title };
}

async function walk(dir: string, baseDir: string, out: KbFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(baseDir, abs) === EXCLUDED_DIR) continue;
      await walk(abs, baseDir, out);
      continue;
    }
    const rel = path.relative(baseDir, abs);
    const type = fileTypeFromPath(rel);
    if (!type) continue;
    // Skip localized sidecars like `foo.fr.md` / `foo.fr.yaml`. The manifest
    // lists canonical files; the file route resolves the right variant at
    // read time via `?lang=`.
    if (/\.[a-z]{2}\.(md|yaml)$/.test(rel)) continue;
    if (type === "md") {
      const { title, meta } = await readMarkdown(abs, rel);
      out.push({ path: rel, title, type, ...(meta ? { meta } : {}) });
    } else {
      out.push({ path: rel, title: humanize(rel), type });
    }
  }
}

/**
 * Walks `kbDir` and returns every public artifact file (yaml/md/html/pdf),
 * excluding the `sensitive/` directory and dotfiles. Sorted by path.
 */
export async function loadKbManifest(kbDir: string): Promise<KbFile[]> {
  const out: KbFile[] = [];
  await walk(kbDir, kbDir, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

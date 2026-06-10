import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fileTypeFromPath, isLocaleSidecar, type KbFileType, type KbLocale } from "@/lib/kb/file-type";
import { humanizeSlug } from "@/lib/kb/meta-format";
import { extractSections, type KbSection } from "@/lib/kb/sections";

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
  date?: string;
  location?: string;
  year?: number;
  url?: string;
  stack?: string[];
  tags?: string[];
  /** Repo-specific fields surfaced for the code section of the KB panel. */
  visibility?: "public" | "private";
  language?: string;
  stars?: number;
  last_active?: string;
  description?: string;
};

export type { KbSection } from "@/lib/kb/sections";

export type KbFile = {
  /** Path relative to the kb directory, e.g. "experience/2025-altergo.md". */
  path: string;
  /** Human-readable title for the file list. */
  title: string;
  type: KbFileType;
  /** Parsed frontmatter, present only for markdown files that have any. */
  meta?: KbFileMeta;
  /** h2/h3 headings, present only for markdown files that have any. */
  sections?: KbSection[];
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function asDateString(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return asString(v);
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
    date: asDateString(data.date),
    location: asString(data.location),
    year: asNumber(data.year),
    url: asString(data.url),
    stack: asStringArray(data.stack),
    tags: asStringArray(data.tags),
    visibility: asVisibility(data.visibility),
    language: asString(data.language),
    stars: asNumber(data.stars),
    last_active: asString(data.last_active),
    description: asString(data.description),
  };
  const hasAny = Object.values(meta).some((v) => v !== undefined);
  return hasAny ? meta : null;
}

/**
 * Reads a markdown file once: derives the title (first `# Heading`, falling
 * back to the humanized path), the parsed frontmatter, and the h2/h3 section
 * outline.
 */
async function readMarkdown(
  absPath: string,
  relPath: string,
): Promise<{ title: string; meta?: KbFileMeta; sections?: KbSection[] }> {
  const raw = await fs.readFile(absPath, "utf8");
  const { data, content } = matter(raw);
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  const stem = path.basename(relPath, path.extname(relPath));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : humanizeSlug(stem);
  const meta = pickMeta(data as Record<string, unknown>);
  const sections = extractSections(content);
  return {
    title,
    ...(meta ? { meta } : {}),
    ...(sections.length > 0 ? { sections } : {}),
  };
}

/** Resolves the localized sidecar (foo.fr.md) when it exists; canonical otherwise.
 * Mirrors the read-time resolution in handleKbFile so tree labels and section
 * slugs always match what the viewer renders. */
async function localizedVariant(abs: string, lang: KbLocale): Promise<string> {
  if (lang === "en") return abs;
  const dot = abs.lastIndexOf(".");
  if (dot <= 0) return abs;
  const candidate = `${abs.slice(0, dot)}.${lang}${abs.slice(dot)}`;
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return abs;
  }
}

async function walk(dir: string, baseDir: string, out: KbFile[], lang: KbLocale): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    // Never follow symlinks. A synced persona repo is untrusted; a symlink
    // (e.g. `leak.md -> /etc/passwd`) must not enter the manifest, or the
    // KB-file route's whitelist would treat it as a readable artifact.
    if (entry.isSymbolicLink()) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, baseDir, out, lang);
      continue;
    }
    const rel = path.relative(baseDir, abs);
    const type = fileTypeFromPath(rel);
    if (!type) continue;
    // Skip localized sidecars like `foo.fr.md` / `foo.fr.yaml`. The manifest
    // lists canonical files; the file route resolves the right variant at
    // read time via `?lang=`.
    if (isLocaleSidecar(rel)) continue;
    if (type === "md") {
      const source = await localizedVariant(abs, lang);
      const { title, meta, sections } = await readMarkdown(source, rel);
      out.push({
        path: rel,
        title,
        type,
        ...(meta ? { meta } : {}),
        ...(sections ? { sections } : {}),
      });
    } else {
      const stem = path.basename(rel, path.extname(rel));
      out.push({ path: rel, title: humanizeSlug(stem), type });
    }
  }
}

/**
 * Walks `kbDir` and returns every public artifact file (yaml/md/html/pdf),
 * excluding dotfiles. Sorted by path.
 */
export async function loadKbManifest(kbDir: string, lang: KbLocale = "en"): Promise<KbFile[]> {
  const out: KbFile[] = [];
  await walk(kbDir, kbDir, out, lang);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

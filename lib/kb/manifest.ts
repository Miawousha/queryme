import { promises as fs } from "node:fs";
import path from "node:path";
import { fileTypeFromPath, type KbFileType } from "@/lib/kb/file-type";

export type KbFile = {
  /** Path relative to the kb directory, e.g. "experience/2025-altergo.md". */
  path: string;
  /** Human-readable title for the file list. */
  title: string;
  type: KbFileType;
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

/** For markdown, prefer the first `# Heading`; otherwise humanize the path. */
async function titleFor(absPath: string, relPath: string, type: KbFileType): Promise<string> {
  if (type === "md") {
    const text = await fs.readFile(absPath, "utf8");
    const heading = text.split("\n").find((line) => /^#\s+/.test(line));
    if (heading) return heading.replace(/^#\s+/, "").trim();
  }
  return humanize(relPath);
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
    out.push({ path: rel, title: await titleFor(abs, rel, type), type });
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

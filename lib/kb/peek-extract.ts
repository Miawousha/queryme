import { slugify } from "@/lib/kb/slug";

/** What a peek targets: the whole doc's intro, or a specific section by slug. */
export type PeekTarget = { kind: "doc" } | { kind: "section"; slug: string };

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

type Line = { text: string; heading: { slug: string; level: number } | null };

/** Tag each line as a heading (outside code fences) or plain text, mirroring
 * extractSections' fence handling and duplicate-slug suffixing. */
function scan(body: string): Line[] {
  const out: Line[] = [];
  const used = new Map<string, number>();
  let fenceChar: string | null = null;
  for (const text of body.split("\n")) {
    const fence = text.match(FENCE_RE);
    if (fence) {
      const ch = fence[1][0];
      fenceChar = fenceChar === null ? ch : fenceChar === ch ? null : fenceChar;
      out.push({ text, heading: null });
      continue;
    }
    if (fenceChar !== null) {
      out.push({ text, heading: null });
      continue;
    }
    const m = text.match(HEADING_RE);
    if (!m) {
      out.push({ text, heading: null });
      continue;
    }
    let slug = slugify(m[2].trim());
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (slug && n > 0) slug = `${slug}-${n}`;
    out.push({ text, heading: { slug, level: m[1].length } });
  }
  return out;
}

/** Join the first run of non-empty, non-heading body lines within [start, end). */
function body(lines: Line[], start: number, end: number): string {
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l.heading) break;
    if (l.text.trim() === "") {
      if (parts.length > 0) break;
      continue;
    }
    parts.push(l.text.trim());
  }
  return parts.join(" ");
}

function clamp(s: string, maxChars: number): string {
  return s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s;
}

/** Extract a short plain-text excerpt for the peek card. Section excerpts run
 * from the matching heading to the next heading; doc excerpts are the intro
 * paragraph (after frontmatter + a leading H1). Unmatched section → doc intro. */
export function extractExcerpt(rawText: string, target: PeekTarget, maxChars = 240): string {
  const lines = scan(rawText.replace(FRONTMATTER_RE, ""));

  if (target.kind === "section") {
    const start = lines.findIndex((l) => l.heading?.slug === target.slug);
    if (start !== -1) {
      let end = start + 1;
      while (end < lines.length && !lines[end].heading) end++;
      return clamp(body(lines, start + 1, end), maxChars);
    }
    // fall through to doc intro on no match
  }

  // doc intro: skip a single leading H1, then the first body run
  const first = lines.findIndex((l) => l.text.trim() !== "");
  const start = first !== -1 && lines[first].heading?.level === 1 ? first + 1 : Math.max(first, 0);
  return clamp(body(lines, start, lines.length), maxChars);
}

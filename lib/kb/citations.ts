export type Citation = {
  token: string;
  path: string;
  anchor: string | null;
};

const CITATION_RE = /\[\^kb:([a-zA-Z0-9._/-]+\.(?:md|yaml))(#[a-zA-Z0-9_-]+)?\]/g;

export function parseCitations(text: string): Citation[] {
  const out: Citation[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const path = match[1];
    if (path.includes("..")) continue;
    out.push({
      token: match[0],
      path,
      anchor: match[2] ? match[2].slice(1) : null,
    });
  }
  return out;
}

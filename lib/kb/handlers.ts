import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCachedContent, getCachedKbManifest } from "@/lib/kb/cache";
import { kbGroups } from "@/lib/kb/content-config";
import { realpathWithin } from "@/lib/kb/safe-path";
import { getPersonaStore } from "@/lib/persona/store";
import type { KbFileType } from "@/lib/kb/file-type";
import type { KbGroup } from "@/lib/kb/meta-format";

/** `cv` is a synthesized type that never appears in the on-disk manifest, so
 * its absence from this map is safe — the panel renders the CV from
 * `<CvPanelView>` without ever hitting this route. */
const CONTENT_TYPE: Record<Exclude<KbFileType, "cv">, string> = {
  md: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
};

export async function handleKbManifest(accountId: string): Promise<Response> {
  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
  if (!root) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  try {
    const manifest = await getCachedKbManifest(accountId);
    let groups: KbGroup[] = [];
    try {
      groups = kbGroups((await getCachedContent(accountId)).config);
    } catch {
      // A malformed config never blocks the panel — the client falls back to
      // its default groups. (Sync rejects bad configs; this guards local overrides.)
    }
    return NextResponse.json({ files: manifest, groups });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}

export async function handleKbFile(req: NextRequest, accountId: string): Promise<Response> {
  const requested = new URL(req.url).searchParams.get("path");
  if (!requested) {
    return NextResponse.json({ error: "A `path` query parameter is required." }, { status: 400 });
  }

  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
  if (!root) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  const KB_DIR = path.join(root, "kb");

  // Whitelist: the path must be an exact manifest entry. Anything else —
  // including traversal attempts — is rejected before touching the filesystem.
  const manifest = await getCachedKbManifest(accountId);
  const entry = manifest.find((f) => f.path === requested);
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const langParam = new URL(req.url).searchParams.get("lang");
  const lang = langParam === "fr" ? "fr" : "en";

  // Try the localized sidecar first when lang is non-English. Build the
  // candidate path by injecting `.<lang>` before the extension.
  async function resolveFile(): Promise<string> {
    if (lang !== "en") {
      const dot = entry!.path.lastIndexOf(".");
      if (dot > 0) {
        const localized = `${entry!.path.slice(0, dot)}.${lang}${entry!.path.slice(dot)}`;
        const candidate = path.join(KB_DIR, localized);
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          /* fall through to canonical */
        }
      }
    }
    return path.join(KB_DIR, entry!.path);
  }

  if (entry.type === "cv") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const filePath = await resolveFile();
    // Final-layer guard: confirm the resolved file really sits inside KB_DIR
    // (a symlink escaping the tree throws here → caught below as a 500, never
    // leaking the target's contents).
    const safePath = await realpathWithin(KB_DIR, filePath);
    const buffer = await fs.readFile(safePath);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": CONTENT_TYPE[entry.type],
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read the file." }, { status: 500 });
  }
}

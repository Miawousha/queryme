import path from "node:path";
import { loadKb, type KbLang } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

/**
 * Process-lifetime caches for the knowledge base. The KB ships with the build
 * and never changes at runtime, so both the assembled public text (fed to the
 * agent) and the file manifest (served to the UI) are loaded once and reused.
 */

const KB_DIR = path.resolve(process.cwd(), "kb");

const publicKbTextByLang = new Map<KbLang, string>();

/** The assembled public KB text given to the chat / MCP agent. */
export async function getCachedPublicKbText(lang: KbLang = "en"): Promise<string> {
  const cached = publicKbTextByLang.get(lang);
  if (cached !== undefined) return cached;
  const text = assemblePublicKbText(await loadKb(KB_DIR, lang));
  publicKbTextByLang.set(lang, text);
  return text;
}

let manifest: KbFile[] | null = null;

/** The public KB file manifest served by the `/api/kb` routes. */
export async function getCachedKbManifest(): Promise<KbFile[]> {
  if (manifest === null) {
    manifest = await loadKbManifest(KB_DIR);
  }
  return manifest;
}

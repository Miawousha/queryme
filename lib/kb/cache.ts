import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

/**
 * Process-lifetime caches for the knowledge base. The KB ships with the build
 * and never changes at runtime, so both the assembled public text (fed to the
 * agent) and the file manifest (served to the UI) are loaded once and reused.
 */

const KB_DIR = path.resolve(process.cwd(), "kb");

let publicKbText: string | null = null;

/** The assembled public KB text given to the chat / MCP agent. */
export async function getCachedPublicKbText(): Promise<string> {
  if (publicKbText === null) {
    publicKbText = assemblePublicKbText(await loadKb(KB_DIR));
  }
  return publicKbText;
}

let manifest: KbFile[] | null = null;

/** The public KB file manifest served by the `/api/kb` routes. */
export async function getCachedKbManifest(): Promise<KbFile[]> {
  if (manifest === null) {
    manifest = await loadKbManifest(KB_DIR);
  }
  return manifest;
}

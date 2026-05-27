import path from "node:path";
import { loadKb, type Kb, type KbLang } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { loadCvConfig, getFeaturedCodeSlugs, type CvConfig } from "@/lib/kb/cv-config";

/**
 * Process-lifetime caches for the knowledge base. The KB ships with the build
 * and never changes at runtime, so the parsed Kb, the assembled public text,
 * the file manifest, and the cv-config are all loaded once and reused.
 */

const KB_DIR = path.resolve(process.cwd(), "kb");
const CONFIG_DIR = process.cwd();

const parsedKbByLang = new Map<KbLang, Kb>();
const publicKbTextByLang = new Map<KbLang, string>();

let cvConfigPromise: Promise<CvConfig | null> | null = null;

function getCvConfig(): Promise<CvConfig | null> {
  if (cvConfigPromise === null) cvConfigPromise = loadCvConfig(CONFIG_DIR);
  return cvConfigPromise;
}

/** The parsed KB graph. Used both by the assembler and by lookup tools. */
export async function getCachedKb(lang: KbLang = "en"): Promise<Kb> {
  const cached = parsedKbByLang.get(lang);
  if (cached !== undefined) return cached;
  const kb = await loadKb(KB_DIR, lang);
  parsedKbByLang.set(lang, kb);
  return kb;
}

/** The assembled public KB text given to the chat / MCP agent. */
export async function getCachedPublicKbText(lang: KbLang = "en"): Promise<string> {
  const cached = publicKbTextByLang.get(lang);
  if (cached !== undefined) return cached;
  const [kb, config] = await Promise.all([getCachedKb(lang), getCvConfig()]);
  const featuredCodeSlugs = getFeaturedCodeSlugs(config) ?? undefined;
  const text = assemblePublicKbText(kb, { featuredCodeSlugs });
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

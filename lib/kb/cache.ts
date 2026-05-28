import path from "node:path";
import { loadKb, type Kb, type KbLang } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { loadCvConfig, getFeaturedCodeSlugs, type CvConfig } from "@/lib/kb/cv-config";
import { getActivePersonaRoot } from "@/lib/persona-source";

/**
 * Process-lifetime caches for the knowledge base. These are invalidated via
 * `resetKbCache()` whenever a sync completes and the active persona root changes.
 */

function kbDir(): string {
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  return path.join(root, "kb");
}

function configDir(): string {
  const root = getActivePersonaRoot();
  if (!root) throw new Error("Persona not configured — no active root");
  return root;
}

const parsedKbByLang = new Map<KbLang, Kb>();
const publicKbTextByLang = new Map<KbLang, string>();

let cvConfigPromise: Promise<CvConfig | null> | null = null;

function getCvConfig(): Promise<CvConfig | null> {
  if (cvConfigPromise === null) cvConfigPromise = loadCvConfig(configDir());
  return cvConfigPromise;
}

export function resetKbCache(): void {
  parsedKbByLang.clear();
  publicKbTextByLang.clear();
  cvConfigPromise = null;
}

/** The parsed KB graph. Used both by the assembler and by lookup tools. */
export async function getCachedKb(lang: KbLang = "en"): Promise<Kb> {
  const cached = parsedKbByLang.get(lang);
  if (cached !== undefined) return cached;
  const kb = await loadKb(kbDir(), lang);
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
    manifest = await loadKbManifest(kbDir());
  }
  return manifest;
}

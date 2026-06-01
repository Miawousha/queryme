import path from "node:path";
import { loadKb, type Kb, type KbLang } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { loadCvConfig, getFeaturedCodeSlugs, type CvConfig } from "@/lib/kb/cv-config";
import { getPersonaStore } from "@/lib/persona/store";

/**
 * Per-account, LRU-bounded caches for the knowledge base. Keyed by accountId;
 * an instance serving many accounts evicts the least-recently-used past the cap.
 * resetKbCache(accountId) clears one account; resetKbCache() clears all (used by
 * persona-source after a sync).
 */
const MAX_ACCOUNTS = 50;

function lruGet<V>(m: Map<string, V>, key: string): V | undefined {
  const v = m.get(key);
  if (v !== undefined) { m.delete(key); m.set(key, v); }
  return v;
}
function lruSet<V>(m: Map<string, V>, key: string, value: V): void {
  m.delete(key);
  m.set(key, value);
  if (m.size > MAX_ACCOUNTS) m.delete(m.keys().next().value as string);
}

function rootFor(accountId: string): string {
  const root = getPersonaStore().getRoot(accountId);
  if (!root) throw new Error(`Persona not configured for account ${accountId}`);
  return root;
}
function kbDir(accountId: string): string { return path.join(rootFor(accountId), "kb"); }
function configDir(accountId: string): string { return rootFor(accountId); }

const parsedKbByAccount = new Map<string, Map<KbLang, Kb>>();
const publicKbTextByAccount = new Map<string, Map<KbLang, string>>();
const cvConfigByAccount = new Map<string, Promise<CvConfig | null>>();
const manifestByAccount = new Map<string, KbFile[]>();

function getCvConfig(accountId: string): Promise<CvConfig | null> {
  let p = lruGet(cvConfigByAccount, accountId);
  if (p === undefined) { p = loadCvConfig(configDir(accountId)); lruSet(cvConfigByAccount, accountId, p); }
  return p;
}

export function resetKbCache(accountId?: string): void {
  if (accountId === undefined) {
    parsedKbByAccount.clear();
    publicKbTextByAccount.clear();
    cvConfigByAccount.clear();
    manifestByAccount.clear();
    return;
  }
  parsedKbByAccount.delete(accountId);
  publicKbTextByAccount.delete(accountId);
  cvConfigByAccount.delete(accountId);
  manifestByAccount.delete(accountId);
}

/** The parsed KB graph for an account. */
export async function getCachedKb(accountId: string, lang: KbLang = "en"): Promise<Kb> {
  let byLang = lruGet(parsedKbByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(parsedKbByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const kb = await loadKb(kbDir(accountId), lang);
  byLang.set(lang, kb);
  return kb;
}

/** The assembled public KB text for an account. */
export async function getCachedPublicKbText(accountId: string, lang: KbLang = "en"): Promise<string> {
  let byLang = lruGet(publicKbTextByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(publicKbTextByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const [kb, config] = await Promise.all([getCachedKb(accountId, lang), getCvConfig(accountId)]);
  const featuredCodeSlugs = getFeaturedCodeSlugs(config) ?? undefined;
  const text = assemblePublicKbText(kb, { featuredCodeSlugs });
  byLang.set(lang, text);
  return text;
}

/** The public KB file manifest for an account. */
export async function getCachedKbManifest(accountId: string): Promise<KbFile[]> {
  const cached = lruGet(manifestByAccount, accountId);
  if (cached !== undefined) return cached;
  const manifest = await loadKbManifest(kbDir(accountId));
  lruSet(manifestByAccount, accountId, manifest);
  return manifest;
}

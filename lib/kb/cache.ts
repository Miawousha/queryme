import path from "node:path";
import {
  loadContent,
  toResumeKb,
  type Kb,
  type KbLang,
  type LoadedContent,
} from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { getPersonaStore } from "@/lib/persona/store";
import type { KbLocale } from "@/lib/kb/file-type";

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

const contentByAccount = new Map<string, Map<KbLang, LoadedContent>>();
const publicKbTextByAccount = new Map<string, Map<KbLang, string>>();
const manifestByAccount = new Map<string, Map<KbLocale, KbFile[]>>();

export function resetKbCache(accountId?: string): void {
  if (accountId === undefined) {
    contentByAccount.clear();
    publicKbTextByAccount.clear();
    manifestByAccount.clear();
    return;
  }
  contentByAccount.delete(accountId);
  publicKbTextByAccount.delete(accountId);
  manifestByAccount.delete(accountId);
}

/** The loaded content engine output for an account (config + collections). */
export async function getCachedContent(accountId: string, lang: KbLang = "en"): Promise<LoadedContent> {
  let byLang = lruGet(contentByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(contentByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const content = await loadContent(rootFor(accountId), lang);
  byLang.set(lang, content);
  return content;
}

/** The typed resume projection for an account (CV, forward-question email). */
export async function getCachedKb(accountId: string, lang: KbLang = "en"): Promise<Kb> {
  return toResumeKb(await getCachedContent(accountId, lang));
}

/** The assembled public KB text for an account. */
export async function getCachedPublicKbText(accountId: string, lang: KbLang = "en"): Promise<string> {
  let byLang = lruGet(publicKbTextByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(publicKbTextByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const content = await getCachedContent(accountId, lang);
  const text = assembleContentText(content);
  byLang.set(lang, text);
  return text;
}

/** The public KB file manifest for an account, locale-resolved. */
export async function getCachedKbManifest(
  accountId: string,
  lang: KbLocale = "en",
): Promise<KbFile[]> {
  let byLang = lruGet(manifestByAccount, accountId);
  if (byLang === undefined) { byLang = new Map(); lruSet(manifestByAccount, accountId, byLang); }
  const cached = byLang.get(lang);
  if (cached !== undefined) return cached;
  const manifest = await loadKbManifest(kbDir(accountId), lang);
  byLang.set(lang, manifest);
  return manifest;
}

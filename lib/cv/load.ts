import path from "node:path";
import { loadKb, type KbLang, type Kb } from "@/lib/kb/loader";
import { filterKbForCv, loadCvConfig } from "@/lib/kb/cv-config";
import { getPersonaStore } from "@/lib/persona/store";
import { loadPersona } from "@/lib/persona";

/**
 * Assemble the CV-filtered KB for an account. This is the single place every CV
 * surface (the /cv and /{username}/cv pages, /api/cv, /api/a/{username}/cv, and
 * the panel copy/download) goes through, so the privacy filter in
 * `filterKbForCv` (public repos only) runs exactly once and cannot be bypassed.
 * Returns null when the account has no configured content root.
 */
export async function loadCvKb(
  accountId: string,
  lang: KbLang,
): Promise<{ root: string; cvKb: Kb } | null> {
  const store = getPersonaStore();
  await store.ensureReady(accountId);
  const root = store.getRoot(accountId);
  if (!root) return null;
  const [kb, config] = await Promise.all([
    loadKb(path.join(root, "kb"), lang),
    loadCvConfig(root),
  ]);
  return { root, cvKb: filterKbForCv(kb, config) };
}

/** Persona full name for an account's CV `<title>`. Null when unconfigured. */
export async function cvPersonaName(accountId: string): Promise<string | null> {
  const store = getPersonaStore();
  await store.ensureReady(accountId);
  const root = store.getRoot(accountId);
  if (!root) return null;
  return loadPersona(root).fullName;
}

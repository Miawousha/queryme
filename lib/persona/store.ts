import type { SyncResult } from "@/lib/persona-source";
import {
  getPersonaRootForAccount,
  ensurePersonaCacheReadyForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";

/**
 * Resolves and synchronises an account's persona content. The v1 implementation
 * is filesystem-backed (per-account /tmp cache); this interface exists so a
 * materialized-store implementation can replace it later without touching callers.
 */
export interface PersonaStore {
  getRoot(accountId: string): string | null;
  ensureReady(accountId: string): Promise<void>;
  sync(accountId: string, repoUrl: string, branch?: string): Promise<SyncResult>;
}

export const fsPersonaStore: PersonaStore = {
  getRoot: (accountId) => getPersonaRootForAccount(accountId),
  ensureReady: (accountId) => ensurePersonaCacheReadyForAccount(accountId),
  sync: (accountId, repoUrl, branch) => syncFromGitHubForAccount(accountId, repoUrl, branch),
};

export function getPersonaStore(): PersonaStore {
  return fsPersonaStore;
}

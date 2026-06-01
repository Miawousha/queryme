import {
  getActivePersonaSourceRowForAccount,
  listSyncHistoryForAccount,
  syncFromGitHubForAccount,
  type SyncResult,
} from "@/lib/persona-source";

export async function personaSourceStatus(accountId: string) {
  const [active, history] = await Promise.all([
    getActivePersonaSourceRowForAccount(accountId),
    listSyncHistoryForAccount(accountId, 10),
  ]);
  return { active, history };
}

export async function personaSourceSync(
  accountId: string,
  repoUrl: string,
  branch?: string,
): Promise<SyncResult> {
  return syncFromGitHubForAccount(accountId, repoUrl, branch);
}

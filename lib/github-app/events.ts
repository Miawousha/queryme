import { parseGitHubRepoUrl } from "@/lib/persona-source";

export type Delivery =
  | { kind: "install"; installationId: string; githubUserId: string; repos: string[] }
  | { kind: "uninstall"; installationId: string }
  | { kind: "repos-added"; installationId: string; repos: string[] }
  | { kind: "push"; installationId: string; repoFullName: string; ref: string }
  | { kind: "pong" }
  | { kind: "ignore" };

type AnyPayload = {
  action?: string;
  installation?: { id?: number | string };
  sender?: { id?: number | string };
  repositories?: Array<{ full_name?: string }>;
  repositories_added?: Array<{ full_name?: string }>;
  repository?: { full_name?: string };
  ref?: string;
};

const repoNames = (rs: Array<{ full_name?: string }> | undefined): string[] =>
  (rs ?? []).map((r) => r.full_name).filter((x): x is string => typeof x === "string" && x.length > 0);

/**
 * Normalizes a verified GitHub App delivery into the action the route takes.
 * Pure — no I/O. Anything unrecognized or missing required fields becomes
 * `ignore` (fail-closed): the route acks 200 and does nothing.
 */
export function parseDelivery(event: string | null, payload: unknown): Delivery {
  const p = (payload ?? {}) as AnyPayload;
  const installationId = p.installation?.id != null ? String(p.installation.id) : null;

  if (event === "ping") return { kind: "pong" };

  if (event === "installation") {
    if (!installationId) return { kind: "ignore" };
    if (p.action === "created") {
      const githubUserId = p.sender?.id != null ? String(p.sender.id) : null;
      if (!githubUserId) return { kind: "ignore" };
      return { kind: "install", installationId, githubUserId, repos: repoNames(p.repositories) };
    }
    if (p.action === "deleted") return { kind: "uninstall", installationId };
    return { kind: "ignore" };
  }

  if (event === "installation_repositories") {
    // Only "added" matters here (a fresh repo to auto-configure). "removed" is
    // intentionally ignored — disconnect happens via the uninstall/manual path.
    if (!installationId || p.action !== "added") return { kind: "ignore" };
    return { kind: "repos-added", installationId, repos: repoNames(p.repositories_added) };
  }

  if (event === "push") {
    const repoFullName = p.repository?.full_name;
    if (!installationId || !repoFullName || typeof p.ref !== "string") return { kind: "ignore" };
    return { kind: "push", installationId, repoFullName, ref: p.ref };
  }

  return { kind: "ignore" };
}

/**
 * True only when a push is for the account's STORED source repo and branch.
 * The security filter: the App may be installed on repos we don't sync, and a
 * push for any other repo/branch must be ignored. Repo comparison is
 * case-insensitive (GitHub treats owner/repo case-insensitively).
 */
export function pushMatchesSource(
  repoFullName: string,
  ref: string,
  sourceRepoUrl: string,
  sourceBranch: string,
): boolean {
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(sourceRepoUrl));
  } catch {
    return false;
  }
  return (
    // owner/repo is case-insensitive on GitHub, but branch names are NOT —
    // keep the ref comparison exact (do not lowercase `sourceBranch`).
    repoFullName.toLowerCase() === `${owner}/${repo}`.toLowerCase() &&
    ref === `refs/heads/${sourceBranch}`
  );
}

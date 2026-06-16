"use client";

import { useEffect, useState } from "react";
import type { PersonaSource } from "@/lib/db/schema";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";

type State = { active: PersonaSource | null; history: PersonaSource[] };

export function ContentTab({
  apiBasePath,
  username,
  appInstallUrl,
}: {
  apiBasePath: string;
  username: string;
  appInstallUrl?: string | null;
}) {
  const [state, setState] = useState<State | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch(`${apiBasePath}/persona-source`);
    if (res.ok) setState(await res.json());
  };

  useEffect(() => {
    void reload();
  }, []);

  const resync = async () => {
    if (!state?.active) return;
    setResyncing(true);
    setResyncError(null);
    const res = await fetch(`${apiBasePath}/persona-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: state.active.repoUrl, branch: state.active.branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setResyncError(body.error ?? "Resync failed");
    } else {
      await reload();
    }
    setResyncing(false);
  };

  if (!state) {
    return <div className="p-4 text-sm text-[var(--color-text-tertiary)]">Loading…</div>;
  }

  return (
    <div className="space-y-6 p-4">
      {state.active ? (
        <>
          <section>
            <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
              Active source
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <div>
                <span className="text-[var(--color-text-tertiary)]">repo: </span>
                <a
                  href={state.active.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {prettyRepo(state.active.repoUrl)}
                </a>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">branch: </span>
                {state.active.branch}
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">commit: </span>
                <code className="text-xs">{state.active.commitSha.slice(0, 7)}</code>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">last synced: </span>
                {new Date(state.active.syncedAt).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={resync}
                disabled={resyncing}
                className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                {resyncing ? "Syncing…" : "Resync from current source"}
              </button>
              {resyncError && <p className="mt-2 text-sm text-red-500">{resyncError}</p>}
            </div>
          </section>

          <section>
            <details>
              <summary className="cursor-pointer font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
                Advanced: change source manually
              </summary>
              <ManualSyncForm
                apiBasePath={apiBasePath}
                onSynced={reload}
                defaultBranch={state.active.branch}
              />
            </details>
          </section>
        </>
      ) : (
        <section>
          <KbSetupSteps
            username={username}
            apiBasePath={apiBasePath}
            appInstallUrl={appInstallUrl}
            onSynced={reload}
          />
        </section>
      )}

      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Sync history
        </h2>
        <ul className="mt-2 space-y-1 text-xs">
          {state.history.map((row) => (
            <li key={row.id} className="flex gap-3">
              <span>{new Date(row.syncedAt).toLocaleString()}</span>
              <span className={row.status === "ok" ? "text-emerald-500" : "text-red-500"}>
                {row.status}
              </span>
              {row.error && (
                <span className="text-[var(--color-text-tertiary)]">{row.error}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function prettyRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

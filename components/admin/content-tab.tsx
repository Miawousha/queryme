"use client";

import { useEffect, useState } from "react";
import type { PersonaSource } from "@/lib/db/schema";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";
import { Field, LABEL } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";

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
    return <p className={`p-4 ${LABEL}`}>Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {state.active ? (
        <>
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Active source</span>
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={state.active.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-display text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
                >
                  {prettyRepo(state.active.repoUrl)}
                </a>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  synced {fmt(state.active.syncedAt)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Branch" value={state.active.branch} />
                <Field label="Commit" value={state.active.commitSha.slice(0, 7)} />
              </div>
              <div>
                <button
                  type="button"
                  onClick={resync}
                  disabled={resyncing}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-60"
                >
                  {resyncing ? "Syncing…" : "Resync from current source"}
                </button>
                {resyncError && <p className="mt-2 text-sm text-red-500">{resyncError}</p>}
              </div>
            </div>
          </section>

          <section>
            <details>
              <summary className={`cursor-pointer ${LABEL}`}>
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

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Sync history</span>
        {state.history.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">No syncs yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {state.history.map((row) => (
              <li key={row.id} className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  {fmt(row.syncedAt)}
                </span>
                <span
                  className={
                    row.status === "ok"
                      ? "font-mono text-[10px] uppercase text-emerald-500"
                      : "font-mono text-[10px] uppercase text-red-500"
                  }
                >
                  {row.status}
                </span>
                {row.error && (
                  <span className="truncate text-[var(--color-text-tertiary)]">{row.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function prettyRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

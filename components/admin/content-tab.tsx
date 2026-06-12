"use client";

import { useEffect, useState } from "react";
import type { PersonaSource } from "@/lib/db/schema";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";

type State = { active: PersonaSource | null; history: PersonaSource[] };

export function ContentTab({
  apiBasePath,
  username,
}: {
  apiBasePath: string;
  username: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch(`${apiBasePath}/persona-source`);
    if (res.ok) setState(await res.json());
  };

  useEffect(() => {
    void reload();
  }, []);

  const sync = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    setLastError(null);
    const res = await fetch(`${apiBasePath}/persona-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: url, branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setLastError(body.error ?? "Sync failed");
    } else {
      setUrl("");
      await reload();
    }
    setSubmitting(false);
  };

  const resync = async () => {
    if (!state?.active) return;
    setSubmitting(true);
    setLastError(null);
    const res = await fetch(`${apiBasePath}/persona-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: state.active.repoUrl, branch: state.active.branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setLastError(body.error ?? "Resync failed");
    } else {
      await reload();
    }
    setSubmitting(false);
  };

  if (!state) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-tertiary)]">Loading…</div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        {state.active ? (
          <>
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
                disabled={submitting}
                className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                {submitting ? "Syncing…" : "Resync from current source"}
              </button>
            </div>
          </>
        ) : (
          <KbSetupSteps username={username} />
        )}
        {lastError && <p className="mt-2 text-sm text-red-500">{lastError}</p>}
      </section>

      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Update source
        </h2>
        <form onSubmit={sync} className="mt-2 space-y-2">
          <label className="block text-sm">
            <span className="block text-xs text-[var(--color-text-tertiary)]">Repo URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://github.com/<owner>/<repo>"
              className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-[var(--color-text-tertiary)]">Branch</span>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !url}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            {submitting ? "Syncing…" : "Sync"}
          </button>
        </form>
      </section>

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

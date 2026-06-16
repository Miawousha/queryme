"use client";

import { useState } from "react";

export function ManualSyncForm({
  apiBasePath,
  onSynced,
  defaultBranch = "main",
}: {
  apiBasePath: string;
  onSynced: () => void | Promise<void>;
  defaultBranch?: string;
}) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

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
      await onSynced();
    }
    setSubmitting(false);
  };

  return (
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
      {lastError && <p className="mt-2 text-sm text-red-500">{lastError}</p>}
    </form>
  );
}

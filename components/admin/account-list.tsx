"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/accounts/repo";
import type { AccountStatus } from "@/lib/db/schema";

const TH = "py-2 pr-4 text-left font-mono text-2xs uppercase text-[var(--color-text-tertiary)]";
const TD = "py-2 pr-4 text-control text-[var(--color-text-secondary)]";
const ACTION =
  "rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-2xs uppercase disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: "border-[var(--color-primary)] text-[var(--color-primary)]",
  waitlisted: "border-[var(--color-accent)] text-[var(--color-accent)]",
  disabled: "border-red-400 text-red-400",
};

/** The status transitions offered for a row, by current status. */
const TRANSITIONS: Record<AccountStatus, { label: string; to: AccountStatus }[]> = {
  waitlisted: [
    { label: "Approve", to: "active" },
    { label: "Disable", to: "disabled" },
  ],
  active: [{ label: "Disable", to: "disabled" }],
  disabled: [{ label: "Re-activate", to: "active" }],
};

export function AccountList({ accounts }: { accounts: AccountSummary[] }) {
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.status])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(a: AccountSummary, status: AccountStatus) {
    setBusyId(a.id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/accounts/${a.username}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? `HTTP ${r.status}`);
      else setStatuses((prev) => ({ ...prev, [a.id]: j.account.status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={TH}>Username</th>
            <th className={TH}>GitHub id</th>
            <th className={TH}>Role</th>
            <th className={TH}>Status</th>
            <th className={TH}>Repo</th>
            <th className={TH}>Convos</th>
            <th className={TH}>Created</th>
            <th className={TH}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const status = statuses[a.id] ?? a.status;
            return (
              <tr key={a.id} className="border-b border-[var(--color-border)]/40">
                <td className={TD}>
                  <Link href={`/${a.username}/admin`} className="text-[var(--color-primary)] hover:underline">
                    {a.username}
                  </Link>
                </td>
                <td className={TD}>{a.githubId ?? "—"}</td>
                <td className={TD}>{a.role}</td>
                <td className={TD}>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-3xs uppercase",
                      STATUS_STYLE[status],
                    )}
                    style={{ letterSpacing: "0.16em" }}
                  >
                    {status}
                  </span>
                </td>
                <td className={TD}>{a.repoLinked ? "linked" : "—"}</td>
                <td className={TD}>{a.conversationCount}</td>
                <td className={TD}>{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className={TD}>
                  <span className="flex items-center gap-2">
                    {TRANSITIONS[status].map((t) => (
                      <button
                        key={t.to}
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => setStatus(a, t.to)}
                        className={cn(
                          ACTION,
                          t.to === "disabled"
                            ? "hover:border-red-400 hover:text-red-400"
                            : "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
                        )}
                        style={{ letterSpacing: "0.18em" }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

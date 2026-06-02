"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

type Instructions = { type: string; name: string; value: string };
type DomainView = {
  id: string;
  hostname: string;
  status: "pending" | "active" | "error";
  lastError?: string | null;
  instructions: Instructions;
};

const STATUS_STYLE: Record<DomainView["status"], string> = {
  active: "border-[var(--color-primary)] text-[var(--color-primary)]",
  pending: "border-[var(--color-accent)] text-[var(--color-accent)]",
  error: "border-red-400 text-red-400",
};

export function DomainsPanel({ apiBasePath }: { apiBasePath: string }) {
  const [domains, setDomains] = useState<DomainView[]>([]);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${apiBasePath}/domains`);
    if (!r.ok) {
      setError(`HTTP ${r.status}`);
      return;
    }
    setDomains((await r.json()).domains ?? []);
  }, [apiBasePath]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  // Auto-poll only while something is still pending.
  useEffect(() => {
    if (!domains.some((d) => d.status === "pending")) return;
    const t = setInterval(() => {
      load().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [domains, load]);

  async function add() {
    if (!hostname.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBasePath}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? `HTTP ${r.status}`);
      else {
        setHostname("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    await fetch(`${apiBasePath}/domains/${id}/refresh`, { method: "POST" }).catch(() => {});
    await load();
  }

  async function remove(id: string) {
    await fetch(`${apiBasePath}/domains/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Add a custom domain (subdomain, e.g. cv.yourname.com)</span>
        <div className="flex items-center gap-2">
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="cv.yourname.com"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-[13px]"
          />
          <button
            type="button"
            disabled={busy || !hostname.trim()}
            onClick={add}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase",
              "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ letterSpacing: "0.18em" }}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div className="flex flex-col gap-3">
        {domains.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)]">No custom domains yet.</p>
        )}
        {domains.map((d) => (
          <div
            key={d.id}
            className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[var(--color-text-primary)]">{d.hostname}</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase",
                  STATUS_STYLE[d.status],
                )}
                style={{ letterSpacing: "0.16em" }}
              >
                {d.status}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => verify(d.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] uppercase hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  style={{ letterSpacing: "0.18em" }}
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] uppercase hover:border-red-400 hover:text-red-400"
                  style={{ letterSpacing: "0.18em" }}
                >
                  Remove
                </button>
              </span>
            </div>
            {d.status !== "active" && (
              <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                Set a {d.instructions.type} record: {d.instructions.name} →{" "}
                <span className="text-[var(--color-text-secondary)]">{d.instructions.value}</span>
              </p>
            )}
            {d.status === "error" && d.lastError && (
              <p className="text-xs text-red-400">{d.lastError}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

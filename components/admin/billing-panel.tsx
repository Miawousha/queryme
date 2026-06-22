"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  apiBasePath: string; // `/api/a/{username}/admin`
  plan: "free" | "pro";
  /** Answered questions this UTC month (chat + MCP). */
  usedThisMonth: number;
  /** The free plan's monthly allowance. */
  freeAllowance: number;
  /** ISO date the subscription renews/ends, when known. */
  currentPeriodEnd: string | null;
};

export function BillingPanel({
  apiBasePath,
  plan,
  usedThisMonth,
  freeAllowance,
  currentPeriodEnd,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(endpoint: "checkout" | "portal") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/billing/${endpoint}`, { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(
          body.error === "already_subscribed"
            ? "You're already on Pro — reload the page."
            : (body.error ?? "Something went wrong — try again."),
        );
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-[var(--color-text-primary)]">
            Billing
          </h2>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-3xs uppercase",
              plan === "pro"
                ? "border-[rgba(var(--color-accent-rgb),0.5)] bg-[rgba(var(--color-accent-rgb),0.08)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)]",
            )}
            style={{ letterSpacing: "0.16em" }}
          >
            {plan}
          </span>
        </div>

        {plan === "free" ? (
          <>
            <p className="text-control text-[var(--color-text-secondary)]">
              {usedThisMonth} of {freeAllowance} free answers used this month. Past the limit,
              visitors are offered the forward-a-question flow instead of live answers.
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${Math.min(100, (usedThisMonth / freeAllowance) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => go("checkout")}
              className={cn(
                "self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-2xs uppercase",
                "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              style={{ letterSpacing: "0.18em" }}
            >
              {busy ? "Redirecting…" : "Upgrade to Pro — $9/month"}
            </button>
          </>
        ) : (
          <>
            <p className="text-control text-[var(--color-text-secondary)]" suppressHydrationWarning>
              Pro is active
              {currentPeriodEnd
                ? ` — renews ${new Date(currentPeriodEnd).toLocaleDateString()}`
                : ""}
              . Unlimited answering within fair-use ceilings, custom domains, MCP.
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {usedThisMonth} answered questions this month.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => go("portal")}
              className={cn(
                "self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-2xs uppercase",
                "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              style={{ letterSpacing: "0.18em" }}
            >
              {busy ? "Redirecting…" : "Manage billing"}
            </button>
          </>
        )}

        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

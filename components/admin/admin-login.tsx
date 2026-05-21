"use client";

import { useState } from "react";

/** Password gate shown at /admin when there is no valid admin session. */
export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Login failed");
    } catch {
      setError("Login failed");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/70 p-6 backdrop-blur"
      >
        <div className="flex flex-col gap-1">
          <span
            className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            queryme
          </span>
          <h1 className="font-display text-lg font-medium text-[var(--color-text-primary)]">
            Admin access
          </h1>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
        />
        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}

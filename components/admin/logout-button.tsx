"use client";

import { useState } from "react";

/** Clears the session cookie and reloads, dropping the user back to sign-in. */
export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-full border border-[var(--color-border)] px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] disabled:opacity-50"
      style={{ letterSpacing: "0.2em" }}
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}

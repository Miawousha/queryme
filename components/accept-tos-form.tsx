"use client";

import { useState } from "react";

export function AcceptTosForm({ returnTo }: { returnTo: string }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <form method="POST" action="/api/auth/accept-tos" className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-control text-[var(--color-text-secondary)]">
        To continue, please review and accept our{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">Terms of Service</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">Privacy Policy</a>.
      </p>
      <label className="flex items-center gap-2 text-control text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I have read and agree to the Terms of Service and Privacy Policy.
      </label>
      <button
        type="submit"
        disabled={!agreed}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-control font-medium text-white disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}

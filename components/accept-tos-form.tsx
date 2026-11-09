"use client";

import { useState } from "react";

export function AcceptTosForm({ returnTo }: { returnTo: string }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <form method="POST" action="/api/auth/accept-tos" className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-control text-[var(--color-text-secondary)]">
        To continue, please review and accept our{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline underline-offset-[3px]">Terms of Service</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline underline-offset-[3px]">Privacy Policy</a>.
      </p>
      <label className="flex items-start gap-2.5 text-control text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
        />
        I have read and agree to the Terms of Service and Privacy Policy.
      </label>
      <button
        type="submit"
        disabled={!agreed}
        className="inline-flex h-10 items-center justify-center bg-[var(--color-text-primary)] px-4 font-heading text-[13px] uppercase tracking-[0.06em] text-[var(--color-void)] transition-colors hover:bg-[var(--color-text-primary)]/80 disabled:opacity-40"
      >
        Continue
      </button>
    </form>
  );
}

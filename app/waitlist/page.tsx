import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { requireSessionAccount } from "@/lib/accounts/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Waitlist — queritae",
  robots: { index: false, follow: false },
};

const GUIDE_URL = "https://github.com/Miawousha/queryme/blob/main/docs/content-repo-guide.md";

export default async function WaitlistPage() {
  const account = await requireSessionAccount();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-xl text-[var(--color-text-primary)]">
        Your account isn&apos;t live yet
      </h1>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        Your account has been created and is waiting for approval. New accounts are reviewed by
        hand, so this can take a little while — your page goes public as soon as it&apos;s approved.
      </p>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        In the meantime you can prepare your content: see the{" "}
        <a
          href={GUIDE_URL}
          className="text-[var(--color-primary)] hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          content repo guide
        </a>
        {account ? " or set up your repo from your admin settings." : "."}
      </p>
      <div className="flex items-center gap-3">
        {account && (
          <Link
            href={`/${account.username}/admin/settings` as Route}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Admin settings →
          </Link>
        )}
        <Link
          href="/"
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

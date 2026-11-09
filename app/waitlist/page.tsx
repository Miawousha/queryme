import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { requireSessionAccount } from "@/lib/accounts/guard";
import { buttonVariants } from "@/components/ui/button";
import { AuthFrame } from "@/components/page-frame";

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
    <AuthFrame
      label="Account"
      note="paused"
      eyebrow="Waitlist"
      title="Your account isn't live yet"
      lead={
        <>
          <p>
            An administrator has paused this account, so your public page is hidden for now. If you
            think this is a mistake, reach out and we&apos;ll take a look.
          </p>
          <p>
            In the meantime you can prepare your content: see the{" "}
            <a
              href={GUIDE_URL}
              className="text-[var(--color-brand)] underline underline-offset-[3px]"
              target="_blank"
              rel="noreferrer"
            >
              content repo guide
            </a>
            {account ? " or set up your repo from your admin settings." : "."}
          </p>
        </>
      }
      actions={
        <>
          {account && (
            <Link
              href={`/${account.username}/admin/settings` as Route}
              className={buttonVariants({ variant: "default", size: "cta" })}
            >
              Admin settings →
            </Link>
          )}
          <Link href="/" className={buttonVariants({ variant: "frame", size: "cta" })}>
            ← Back to home
          </Link>
        </>
      }
    />
  );
}

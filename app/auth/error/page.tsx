import Link from "next/link";

const MESSAGES: Record<string, string> = {
  not_configured: "Sign-in isn't configured on this deployment yet.",
  denied: "You declined the GitHub authorization.",
  bad_state: "The sign-in request expired or was tampered with. Please try again.",
  github: "We couldn't reach GitHub to verify your identity. Please try again.",
  reserved: "That GitHub username is reserved and can't be used for an account.",
  conflict: "That username is already linked to a different GitHub account.",
  server: "Something went wrong creating your account. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ""] ?? "Sign-in failed. Please try again.";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-xl text-[var(--color-text-primary)]">Sign-in failed</h1>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">{message}</p>
      <Link
        href="/"
        className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        ← Back to home
      </Link>
    </main>
  );
}

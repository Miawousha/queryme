import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthFrame } from "@/components/page-frame";

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
    <AuthFrame
      label="Sign in"
      note={reason ?? "error"}
      eyebrow="GitHub sign-in"
      title="Sign-in failed"
      lead={<p>{message}</p>}
      actions={
        <>
          <a href="/api/auth/github/login" className={buttonVariants({ variant: "default", size: "cta" })}>
            Try again
          </a>
          <Link href="/" className={buttonVariants({ variant: "frame", size: "cta" })}>
            ← Back to home
          </Link>
        </>
      }
    />
  );
}

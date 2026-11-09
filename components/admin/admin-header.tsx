import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/admin/logout-button";

/** Speech bubble — links back to the public chat page. */
function ChatIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

export function AdminHeader({ username }: { username: string }) {
  return (
    <header
      aria-label="queritae admin"
      className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-void)] px-4 sm:px-6"
    >
      <div className="flex shrink-0 items-center gap-3">
        <MatriceLogo size={19} />
        <div className="flex flex-col gap-1 leading-none">
          <span className="whitespace-nowrap font-heading text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-primary)]">
            queritae
          </span>
          <span className="whitespace-nowrap font-heading text-2xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-brand)]" aria-hidden>
              ✦{" "}
            </span>
            Admin
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <a
          href={`/${username}`}
          title="View your public chat page"
          className="inline-flex h-8 items-center gap-1.5 border border-[var(--color-text-primary)]/70 bg-[var(--color-void)] px-3 font-heading text-2xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-text-primary)] hover:text-[var(--color-void)]"
        >
          <ChatIcon />
          <span>Chat</span>
        </a>
        <span className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)]" style={{ letterSpacing: "0.14em" }}>
          {username}
        </span>
        <ThemeToggle label="Switch between light and dark theme" />
        <LogoutButton />
      </div>
    </header>
  );
}

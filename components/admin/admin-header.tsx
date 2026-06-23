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
      className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6"
    >
      <div className="flex shrink-0 items-center gap-3">
        <MatriceLogo size={28} animated />
        <div className="flex flex-col leading-tight">
          <span
            className="whitespace-nowrap font-mono text-2xs uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            queritae
          </span>
          <span
            className="whitespace-nowrap font-display text-sm font-medium text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            Admin
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <a
          href={`/${username}`}
          title="View your public chat page"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-1 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
        >
          <ChatIcon />
          <span>Chat</span>
        </a>
        <span className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)]" style={{ letterSpacing: "0.18em" }}>
          {username}
        </span>
        <ThemeToggle label="Switch between light and dark theme" />
        <LogoutButton />
      </div>
    </header>
  );
}

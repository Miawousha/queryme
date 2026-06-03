import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/admin/logout-button";

export function AdminHeader({ username }: { username: string }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
      <h1 className="sr-only">queryme — Admin</h1>
      <div className="flex shrink-0 items-center gap-3">
        <MatriceLogo size={28} animated />
        <div className="flex flex-col leading-tight">
          <span
            className="whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            queryme
          </span>
          <span
            className="whitespace-nowrap font-display text-[14px] font-medium text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            Admin
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]" style={{ letterSpacing: "0.18em" }}>
          {username}
        </span>
        <ThemeToggle label="Switch between light and dark theme" />
        <LogoutButton />
      </div>
    </header>
  );
}

import type { ReactNode } from "react";
import { LABEL } from "@/components/admin/ui";

/**
 * Standard page header for every admin section: a mono eyebrow (the rail group
 * it belongs to), a display-font title that anchors the page, an optional
 * one-line description, and a right-aligned slot for page-level actions.
 *
 * Gives each route an orientation point the admin previously lacked — pages
 * dropped straight into content with no title. Keep titles to a noun phrase.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && (
          <span className={LABEL} style={{ letterSpacing: "0.18em" }}>
            {eyebrow}
          </span>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h1>
        {description && (
          <p className="text-control text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

import type { ReactNode } from "react";
import { Eyebrow, TITLE } from "@/components/ui/matrice";

/**
 * Standard page header for every admin section, as v2's workspace PageHeader:
 * the blue eyebrow badge (the rail group it belongs to), the uppercase mono
 * title that anchors the page, an optional one-line description, and a
 * right-aligned slot for page-level actions.
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
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="flex min-w-0 max-w-3xl flex-col">
        {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
        <h1
          className={`${TITLE} text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.1] text-[var(--color-text-primary)]`}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

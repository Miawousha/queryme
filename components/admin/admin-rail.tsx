"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { LABEL } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type IconName = "conversations" | "questions" | "analytics" | "content" | "domains" | "billing" | "signature";
type Item = { href: string; label: string; icon: IconName; count?: number; accentCount?: boolean };
type Group = { title: string; items: Item[] };

export function AdminRail({
  adminBasePath,
  counts,
}: {
  adminBasePath: string;
  counts: { conversations: number; unanswered: number };
}) {
  const pathname = usePathname();
  const groups: Group[] = [
    {
      title: "Activity",
      items: [
        { href: adminBasePath, label: "Conversations", icon: "conversations", count: counts.conversations },
        {
          href: `${adminBasePath}/questions`,
          label: "Questions",
          icon: "questions",
          count: counts.unanswered || undefined,
          accentCount: true,
        },
        { href: `${adminBasePath}/analytics`, label: "Analytics", icon: "analytics" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: `${adminBasePath}/settings/content`, label: "Content source", icon: "content" },
        { href: `${adminBasePath}/settings/domains`, label: "Custom domains", icon: "domains" },
        { href: `${adminBasePath}/settings/billing`, label: "Billing", icon: "billing" },
        { href: `${adminBasePath}/settings/signature`, label: "Email signature", icon: "signature" },
      ],
    },
  ];

  function isActive(href: string): boolean {
    // The index route must match exactly (it is a prefix of every other route);
    // everything else matches on prefix so query params / sub-paths stay active.
    return href === adminBasePath ? pathname === href : pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Admin sections"
      className="flex w-52 shrink-0 flex-col gap-6 border-r border-[var(--color-border)] px-3 py-6"
    >
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1.5">
          <span className={cn(LABEL, "px-2")} style={{ letterSpacing: "0.18em" }}>
            {g.title}
          </span>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href as Route}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border-l-2 px-2.5 py-1.5 text-control transition-colors",
                      active
                        ? "border-[var(--color-accent)] bg-[var(--color-card)] text-[var(--color-accent)]"
                        : "border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-card)]/40 hover:text-[var(--color-primary)]",
                    )}
                  >
                    <RailIcon name={it.icon} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.count != null && (
                      <span
                        className={cn(
                          "font-mono text-2xs",
                          it.accentCount
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-tertiary)]",
                        )}
                      >
                        {it.count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Line glyphs in a 24×24 box, stroked with currentColor so they track the
 * link's active/hover colour. Matches the KbFileGlyph drawing convention. */
function RailIcon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {GLYPHS[name]}
    </svg>
  );
}

const GLYPHS: Record<IconName, React.ReactNode> = {
  conversations: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  questions: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9M13 17V5M8 17v-4" />
    </>
  ),
  content: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </>
  ),
  domains: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  billing: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  signature: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
};

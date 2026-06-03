"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { LABEL } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; count?: number; accentCount?: boolean };
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
        { href: adminBasePath, label: "Conversations", count: counts.conversations },
        {
          href: `${adminBasePath}/questions`,
          label: "Questions",
          count: counts.unanswered || undefined,
          accentCount: true,
        },
        { href: `${adminBasePath}/analytics`, label: "Analytics" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: `${adminBasePath}/settings/content`, label: "Content source" },
        { href: `${adminBasePath}/settings/domains`, label: "Custom domains" },
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
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-[var(--color-card)] text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]",
                    )}
                  >
                    <span>{it.label}</span>
                    {it.count != null && (
                      <span
                        className={cn(
                          "font-mono text-[10px]",
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

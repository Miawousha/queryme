"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function OutlineTitle({
  title,
  outline,
  onJumpTo,
  outlineLabel,
  outlineAria,
}: {
  title: string;
  outline: { slug: string; title: string; level: 2 | 3; chip?: number }[];
  onJumpTo: (slug: string) => void;
  outlineLabel: string;
  outlineAria?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Wrap around: ArrowDown past last → first; ArrowUp before first → last.
  function focusItem(rawIndex: number) {
    const len = outline.length;
    if (len === 0) return;
    const index = ((rawIndex % len) + len) % len;
    itemRefs.current[index]?.focus();
  }

  function closeAndReturnFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Focus the first item each time the menu opens.
  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  return (
    <div
      className="relative min-w-0"
      onKeyDown={(e) => {
        if (!open) return;
        const activeIdx = itemRefs.current.findIndex((r) => r === document.activeElement);
        switch (e.key) {
          case "Escape":
            e.preventDefault();
            // Stop propagation so a single Escape closes only this menu and not
            // the surrounding dialog (focus-mode overlay or mobile drawer via useDialog).
            e.stopPropagation();
            closeAndReturnFocus();
            break;
          case "ArrowDown": {
            e.preventDefault();
            focusItem(activeIdx === -1 ? 0 : activeIdx + 1);
            break;
          }
          case "ArrowUp": {
            e.preventDefault();
            focusItem(activeIdx === -1 ? outline.length - 1 : activeIdx - 1);
            break;
          }
          case "Home":
            e.preventDefault();
            focusItem(0);
            break;
          case "End":
            e.preventDefault();
            focusItem(outline.length - 1);
            break;
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={outlineAria ?? outlineLabel}
        className="flex min-w-0 items-center gap-1 text-control text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
      >
        <span className="min-w-0 truncate">{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={outlineAria ?? outlineLabel}
          className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {outline.map((s, i) => (
            <button
              key={s.slug}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                onJumpTo(s.slug);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[rgba(var(--color-primary-rgb),0.08)] hover:text-[var(--color-text-primary)]"
              style={{ paddingLeft: s.level === 3 ? 20 : 8 }}
            >
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              {s.chip !== undefined && (
                <span className="kb-chip">[{s.chip}]</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type KbDocAction = {
  key: string;
  label: string;
  ariaLabel: string;
  /** Returning a string flips the button into a transient "feedback" state
   * with that label (e.g. "Copied"). The button reverts after ~1.5s. */
  onClick: () => string | void | Promise<string | void>;
  icon: ReactNode;
};

/**
 * Shared top band for documents inside the KB side panel. Hosts Back, title,
 * an optional type badge, an optional details toggle, configurable
 * actions (Copy / Download / Print / GitHub …), and the focus-mode toggle.
 */
export function KbDocToolbar({
  title,
  typeBadge,
  backLabel,
  onBack,
  actions,
  focused,
  onToggleFocus,
  expandLabel,
  minimizeLabel,
  breadcrumb,
  outline,
  onJumpTo,
  outlineLabel,
  outlineAria,
}: {
  title: string;
  typeBadge?: string;
  backLabel: string;
  onBack: () => void;
  actions: KbDocAction[];
  focused: boolean;
  onToggleFocus: () => void;
  expandLabel: string;
  minimizeLabel: string;
  /** Container labels shown muted before the title (collection, folders). */
  breadcrumb?: string[];
  /** Doc sections for the intra-doc jump dropdown; chip = citation index. */
  outline?: { slug: string; title: string; level: 2 | 3; chip?: number }[];
  onJumpTo?: (slug: string) => void;
  outlineLabel?: string;
  /** Accessible aria-label for the outline trigger button (from strings.outlineAria). */
  outlineAria?: string;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="shrink-0 whitespace-nowrap font-mono text-2xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
        style={{ letterSpacing: "0.2em" }}
      >
        ‹ {backLabel}
      </button>
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <span className="hidden min-w-0 shrink truncate text-2xs text-[var(--color-text-tertiary)] sm:inline max-w-[50%]">
            {breadcrumb.join(" / ")}&nbsp;/
          </span>
        )}
        {outline && outline.length > 0 && onJumpTo ? (
          <OutlineTitle
            title={title}
            outline={outline}
            onJumpTo={onJumpTo}
            outlineLabel={outlineLabel ?? "Outline"}
            outlineAria={outlineAria}
          />
        ) : (
          <span className="min-w-0 truncate text-control text-[var(--color-text-primary)]">
            {title}
          </span>
        )}
      </div>
      {typeBadge && (
        <span
          className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-3xs uppercase text-[var(--color-text-secondary)]"
          style={{ letterSpacing: "0.16em" }}
        >
          {typeBadge}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((a) => (
          <ActionButton key={a.key} action={a} />
        ))}
        <button
          type="button"
          onClick={onToggleFocus}
          aria-label={focused ? minimizeLabel : expandLabel}
          title={focused ? minimizeLabel : expandLabel}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
        >
          {focused ? <MinimizeIcon /> : <ExpandIcon />}
        </button>
      </div>
    </div>
  );
}

function ActionButton({ action }: { action: KbDocAction }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await action.onClick();
        if (typeof result === "string") {
          setFeedback(result);
          setTimeout(() => setFeedback(null), 1500);
        }
      }}
      aria-label={action.ariaLabel}
      title={feedback ?? action.label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
        feedback
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]",
      )}
    >
      {action.icon}
    </button>
  );
}

const ICON_PROPS = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function CopyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function PrintIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

export function GithubIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
    </svg>
  );
}

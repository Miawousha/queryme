"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
        style={{ letterSpacing: "0.2em" }}
      >
        ‹ {backLabel}
      </button>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-primary)]">
        {title}
      </span>
      {typeBadge && (
        <span
          className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
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

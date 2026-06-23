import type { PersonaSource } from "@/lib/db/schema";

type StepStatus = "done" | "current" | "upcoming";

const STEPS = [
  { key: "build", label: "Build content repo" },
  { key: "connect", label: "Connect repo" },
  { key: "sync", label: "First sync" },
] as const;

// Derive a step's status purely from the persona-source state. `connected`
// means at least one sync was attempted (history exists); `active` means one
// succeeded. See the table in the Content tab: no history → build; attempted
// but not live → first sync; live → all done.
function statusFor(key: string, active: PersonaSource | null, connected: boolean): StepStatus {
  if (active) return "done";
  if (key === "build") return connected ? "done" : "current";
  if (key === "connect") return connected ? "done" : "upcoming";
  return connected ? "current" : "upcoming"; // first sync
}

/**
 * Compact onboarding status strip for the Content tab. Renders the three setup
 * milestones and persists through completion — once a source is live it
 * collapses to a single confirmation line rather than disappearing.
 */
export function KbProgressStrip({
  active,
  historyCount,
}: {
  active: PersonaSource | null;
  historyCount: number;
}) {
  if (active) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-2xs text-emerald-500">
          ✓
        </span>
        <span className="font-mono text-2xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Your knowledge base is live
        </span>
      </div>
    );
  }

  const connected = historyCount > 0;

  return (
    <ol
      aria-label="Knowledge base setup progress"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 px-4 py-2.5"
    >
      {STEPS.map((step, i) => {
        const status = statusFor(step.key, active, connected);
        const isCurrent = status === "current";
        return (
          <li
            key={step.key}
            {...(isCurrent ? { "aria-current": "step" as const } : {})}
            className="flex items-center gap-2"
          >
            <span
              className={[
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs font-medium",
                status === "done"
                  ? "border-transparent bg-emerald-500/15 text-emerald-500"
                  : isCurrent
                    ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-tertiary)]",
              ].join(" ")}
            >
              {status === "done" ? "✓" : i + 1}
            </span>
            <span
              className={[
                "font-mono text-2xs uppercase tracking-wider",
                isCurrent
                  ? "text-[var(--color-text-primary)]"
                  : status === "done"
                    ? "text-[var(--color-text-secondary)]"
                    : "text-[var(--color-text-tertiary)]",
              ].join(" ")}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="ml-1 hidden h-px w-6 bg-[var(--color-border)] sm:inline-block"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

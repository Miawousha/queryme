import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60",
        "px-3.5 py-2.5 text-[14px] text-[var(--color-text-primary)]",
        "placeholder:text-[var(--color-text-tertiary)]",
        "outline-none transition-colors",
        "focus-visible:border-[var(--color-primary)] focus-visible:bg-[var(--color-surface)]/80",
        "focus-visible:ring-2 focus-visible:ring-[rgba(var(--color-primary-rgb),0.25)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-[14px]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

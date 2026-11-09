import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[44px] w-full border border-[var(--color-input)] bg-[var(--color-void)]",
        "px-3.5 py-2.5 text-sm text-[var(--color-text-primary)]",
        "placeholder:text-[var(--color-text-tertiary)]",
        "outline-none transition-colors",
        "focus-visible:border-[var(--color-ring)] focus-visible:ring-3 focus-visible:ring-[var(--color-ring)]/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

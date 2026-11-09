import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/*
 * Matrice's buttons (matrice-website-v2, components/ui/button.tsx): square,
 * the filled one in the foreground colour (light on the dark theme, dark on
 * the light), `frame` an outlined box that fills on hover, and `cta` the
 * mono uppercase size the site's calls to action use.
 */
const buttonStyles = cva(
  [
    "group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "border border-transparent text-control font-medium",
    "transition-colors duration-150 outline-none select-none",
    "focus-visible:border-[var(--color-ring)] focus-visible:ring-3 focus-visible:ring-[var(--color-ring)]/50",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-text-primary)] text-[var(--color-void)] hover:bg-[var(--color-text-primary)]/80",
        brand: "bg-[var(--color-brand)] text-[var(--color-void)] hover:bg-[var(--color-brand)]/85",
        frame:
          "border-[var(--color-text-primary)]/70 bg-[var(--color-void)] text-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)] hover:text-[var(--color-void)]",
        outline:
          "border-[var(--color-border)] bg-[var(--color-void)] text-[var(--color-text-primary)] hover:bg-[var(--color-card)]",
        ghost:
          "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-card)] hover:text-[var(--color-text-primary)]",
        link: "h-auto px-0 text-[var(--color-accent)] underline-offset-4 hover:underline",
        destructive:
          "bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/20 focus-visible:ring-[var(--color-destructive)]/30",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-10 px-4 text-sm",
        icon: "size-9",
        cta: "h-10 gap-2 px-4 font-heading text-[13px] uppercase tracking-[0.06em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/** Merged class names, safe to apply to links and other non-button elements. */
function buttonVariants(props?: Parameters<typeof buttonStyles>[0]) {
  return cn(buttonStyles(props));
}

export { Button, buttonVariants };

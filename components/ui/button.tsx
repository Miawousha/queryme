import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-full font-display text-[13px] font-medium tracking-tight",
    "transition-all duration-200 outline-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-void)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[var(--color-accent)] text-[var(--color-void)]",
          "shadow-[0_0_0_1px_rgba(var(--color-accent-rgb),0.4),0_8px_24px_-8px_rgba(var(--color-accent-rgb),0.5)]",
          "hover:brightness-110 active:brightness-95",
        ].join(" "),
        outline: [
          "border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)]",
          "hover:border-[var(--color-primary)] hover:bg-[rgba(var(--color-primary-rgb),0.10)]",
        ].join(" "),
        ghost:
          "bg-transparent text-[var(--color-text-secondary)] hover:bg-[rgba(var(--color-primary-rgb),0.10)] hover:text-[var(--color-text-primary)]",
        link: "h-auto px-0 text-[var(--color-accent)] underline-offset-4 hover:underline",
        destructive:
          "bg-red-500/90 text-white hover:bg-red-500 focus-visible:ring-red-400",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-[12px]",
        lg: "h-11 px-6 text-[14px]",
        icon: "h-9 w-9",
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
  VariantProps<typeof buttonVariants> & {
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

export { Button, buttonVariants };

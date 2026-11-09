import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge only knows Tailwind's stock font sizes; the type scale in
 * app/globals.css adds its own (`text-3xs` … `text-display`). Unregistered,
 * they read as text colours, and merging one with a `text-[var(--…)]` colour
 * would drop the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["3xs", "2xs", "label", "control", "cozy", "display"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

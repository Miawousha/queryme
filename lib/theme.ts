/**
 * Light/dark theme primitives.
 *
 * The theme is applied as a `data-theme` attribute on `<html>`; every color is
 * a CSS variable, so switching the attribute reskins the whole page. This
 * module holds the storage key, the `Theme` type, and the pure resolution
 * logic shared (in spirit) with the no-flash inline script in `app/layout.tsx`.
 */

export const THEME_STORAGE_KEY = "queritae:theme";

export type Theme = "light" | "dark";

/**
 * Resolves the theme to use on first render: an explicitly stored choice wins;
 * otherwise fall back to the operating system's `prefers-color-scheme`.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

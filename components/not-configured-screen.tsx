import { MatriceLogo } from "@/components/matrice-logo";

/**
 * Rendered by `app/page.tsx` when no persona has been synced yet — i.e. the
 * `persona_source` table is empty and `PERSONA_LOCAL_OVERRIDE` is unset.
 * Public visitors see this; the admin Content tab handles configuration.
 */
export function NotConfiguredScreen() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <MatriceLogo size={48} animated />
      <div>
        <h1 className="font-display text-lg text-[var(--color-text-primary)]">queryme</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
          This deployment has no persona configured yet.
        </p>
      </div>
    </main>
  );
}

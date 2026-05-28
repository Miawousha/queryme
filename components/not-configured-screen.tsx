/**
 * Fallback when no persona has been synced yet. Task 23 expands this with
 * styling matching the rest of the app shell; for now it's a minimal text
 * placeholder so app/page.tsx can render something when getActivePersonaRoot()
 * returns null.
 */
export function NotConfiguredScreen() {
  return (
    <main className="flex h-dvh items-center justify-center px-6">
      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        This deployment has no persona configured yet.
      </p>
    </main>
  );
}

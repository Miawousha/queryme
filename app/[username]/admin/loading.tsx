/**
 * Suspense fallback for the admin section content area. Because it sits below
 * the shared layout, the header + nav rail stay put and only the main panel
 * swaps to this skeleton — so switching tabs feels instant even while each
 * (force-dynamic) section runs its query. A column of card placeholders that
 * mirrors the record lists, which is the most common view.
 */
export default function AdminSectionLoading() {
  return (
    <div className="flex flex-col gap-2" aria-hidden role="status" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[58px] animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

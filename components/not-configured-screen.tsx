import { AuthFrame } from "@/components/page-frame";

/**
 * Rendered by `app/page.tsx` when no persona has been synced yet — i.e. the
 * `persona_source` table is empty and `PERSONA_LOCAL_OVERRIDE` is unset.
 * Public visitors see this; the admin Content tab handles configuration.
 */
export function NotConfiguredScreen() {
  return (
    <AuthFrame
      label="queritae"
      note="not configured"
      eyebrow="Setup"
      title="Nothing to show yet"
      lead={<p>This deployment has no persona configured yet.</p>}
    />
  );
}

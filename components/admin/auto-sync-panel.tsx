"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/admin/format";

type View = {
  enabled: boolean;
  configured: boolean;
  lastDeliveryAt: string | null;
  connectedViaApp: boolean;
  manageUrl: string | null;
  appInstallUrl: string | null;
};

type Action = "enable" | "disable";

export function AutoSyncPanel({
  apiBasePath,
  justInstalled = false,
}: {
  apiBasePath: string;
  justInstalled?: boolean;
}) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  // After a fresh App install the install→account mapping is done by the
  // webhook, which can land a beat after the post-install redirect. Show a
  // "finishing setup" hint until one delayed re-fetch settles the connection.
  const [settling, setSettling] = useState(justInstalled);

  const load = async () => {
    const res = await fetch(`${apiBasePath}/auto-sync`);
    if (res.ok) setView(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!justInstalled) return;
    const t = setTimeout(() => {
      void load().finally(() => setSettling(false));
    }, 2500);
    return () => clearTimeout(t);
  }, [justInstalled]);

  const act = async (action: Action) => {
    setBusy(true);
    const res = await fetch(`${apiBasePath}/auto-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setView(await res.json());
    setBusy(false);
  };

  if (!view) return null;

  const toggle = (
    <button
      type="button"
      onClick={() => act(view.enabled ? "disable" : "enable")}
      disabled={busy}
      className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
    >
      {view.enabled ? "Disable" : "Enable"}
    </button>
  );

  const lastDelivery = view.lastDeliveryAt ? (
    <p className="text-2xs text-[var(--color-text-tertiary)]">
      Last delivery: {fmt(view.lastDeliveryAt)}
    </p>
  ) : null;

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">
          Auto-sync
        </h2>
        {toggle}
      </div>

      {settling && !view.connectedViaApp && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Finishing setup… connecting your GitHub App install.
        </p>
      )}

      {view.connectedViaApp ? (
        <div className="space-y-2 text-sm">
          <p className="text-[var(--color-accent)]">
            {view.enabled
              ? "Connected via GitHub App ✓"
              : "Connected via GitHub App — paused"}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {view.enabled
              ? "Every push to your repo syncs automatically."
              : "Re-enable to resume syncing on push."}
          </p>
          {view.manageUrl && (
            <a
              href={view.manageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded border border-[var(--color-border)] px-3 py-1 text-xs"
            >
              Manage on GitHub
            </a>
          )}
          {lastDelivery}
        </div>
      ) : view.appInstallUrl ? (
        <div className="space-y-2 text-sm">
          <a
            href={view.appInstallUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            Connect with GitHub App (recommended)
          </a>
          <p className="text-2xs text-[var(--color-text-tertiary)]">
            One click installs auto-sync on your repo — no webhook setup needed.
          </p>
          {!view.enabled ? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Off — connect the App above to enable auto-sync.
            </p>
          ) : null}
          {lastDelivery}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Off — the live page only updates on a manual Sync. Enable to
            auto-sync on every push.
          </p>
          {lastDelivery}
        </div>
      )}
    </div>
  );
}

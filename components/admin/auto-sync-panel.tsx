"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/admin/format";

type View = {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string;
  secret: string | null;
  lastDeliveryAt: string | null;
  connectedViaApp: boolean;
  manageUrl: string | null;
  appInstallUrl: string | null;
};

type Action = "enable" | "disable" | "regenerate";

export function AutoSyncPanel({
  apiBasePath,
  justInstalled = false,
}: {
  apiBasePath: string;
  justInstalled?: boolean;
}) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
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

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — leave the value on screen to copy manually */
    }
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

  const webhook =
    view.enabled && view.secret ? (
      <ManualWebhook
        webhookUrl={view.webhookUrl}
        secret={view.secret}
        copied={copied}
        copy={copy}
        busy={busy}
        onRegenerate={() => act("regenerate")}
      />
    ) : null;

  const advancedWebhook = webhook && (
    <details>
      <summary className="cursor-pointer font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
        Advanced: manual webhook
      </summary>
      {webhook}
    </details>
  );

  const lastDelivery = view.lastDeliveryAt ? (
    <p className="text-[10px] text-[var(--color-text-tertiary)]">
      Last delivery: {fmt(view.lastDeliveryAt)}
    </p>
  ) : null;

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
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
          {advancedWebhook}
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
          <p className="text-[10px] text-[var(--color-text-tertiary)]">
            One click installs auto-sync on your repo — no webhook setup needed.
          </p>
          {advancedWebhook ??
            (!view.enabled ? (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Off — connect the App above, or enable a manual webhook.
              </p>
            ) : null)}
          {lastDelivery}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {webhook ?? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Off — the live page only updates on a manual Sync. Enable to
              auto-sync on every push.
            </p>
          )}
          {lastDelivery}
        </div>
      )}
    </div>
  );
}

function ManualWebhook({
  webhookUrl,
  secret,
  copied,
  copy,
  busy,
  onRegenerate,
}: {
  webhookUrl: string;
  secret: string;
  copied: string | null;
  copy: (label: string, text: string) => void;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const ghCommand =
    `gh api repos/:owner/:repo/hooks -f name=web -F active=true -f 'events[]=push' ` +
    `-f config[url]='${webhookUrl}' -f config[content_type]=json -f config[secret]='${secret}'`;

  return (
    <div className="mt-2 space-y-3 text-sm">
      <p className="text-[var(--color-text-tertiary)]">
        Add a GitHub webhook to your content repo so each push auto-syncs your page.
      </p>

      <CopyRow
        id="url"
        label="Payload URL"
        value={webhookUrl}
        copied={copied}
        onCopy={() => copy("url", webhookUrl)}
      />
      <CopyRow
        id="secret"
        label="Secret"
        value={secret}
        copied={copied}
        onCopy={() => copy("secret", secret)}
      />

      <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--color-text-tertiary)]">
        <li>Repo → Settings → Webhooks → Add webhook</li>
        <li>
          Paste the Payload URL, set Content type to <code>application/json</code>
        </li>
        <li>Paste the Secret, choose "Just the push event", save</li>
      </ol>

      <div>
        <div className="text-xs text-[var(--color-text-tertiary)]">Or run (gh CLI)</div>
        <div className="mt-1">
          <button
            type="button"
            onClick={() => copy("gh", ghCommand)}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-[10px]"
          >
            {copied === "gh" ? "Copied gh command" : "Copy gh command"}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy}
        className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
      >
        Regenerate secret
      </button>
      <p className="text-[10px] text-[var(--color-text-tertiary)]">
        Regenerating invalidates the old secret — update the webhook in GitHub afterward.
      </p>
    </div>
  );
}

function CopyRow({
  id,
  label,
  value,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  value: string;
  copied: string | null;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded border border-[var(--color-border)] px-2 py-1 text-xs">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded border border-[var(--color-border)] px-2 py-1 text-[10px]"
        >
          {copied === id ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

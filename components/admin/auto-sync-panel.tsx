"use client";

import { useEffect, useState } from "react";

type View = {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string;
  secret: string | null;
  lastDeliveryAt: string | null;
};

type Action = "enable" | "disable" | "regenerate";

export function AutoSyncPanel({ apiBasePath }: { apiBasePath: string }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`${apiBasePath}/auto-sync`);
    if (res.ok) setView(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

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

  const ghCommand = view.secret
    ? `gh api repos/:owner/:repo/hooks -f name=web -F active=true -f 'events[]=push' ` +
      `-f config[url]='${view.webhookUrl}' -f config[content_type]=json -f config[secret]='${view.secret}'`
    : "";

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Auto-sync on push
        </h2>
        <button
          type="button"
          onClick={() => act(view.enabled ? "disable" : "enable")}
          disabled={busy}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
        >
          {view.enabled ? "Disable" : "Enable"}
        </button>
      </div>

      {view.enabled && view.secret ? (
        <div className="space-y-3 text-sm">
          <p className="text-[var(--color-text-tertiary)]">
            Add a GitHub webhook to your content repo so each push auto-syncs your page.
          </p>

          <CopyRow
            id="url"
            label="Payload URL"
            value={view.webhookUrl}
            copied={copied}
            onCopy={() => copy("url", view.webhookUrl)}
          />
          <CopyRow
            id="secret"
            label="Secret"
            value={view.secret}
            copied={copied}
            onCopy={() => copy("secret", view.secret!)}
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
              <span className="ml-2 text-[10px] text-[var(--color-text-tertiary)]">
                (copies the full <code>gh api</code> invocation to your clipboard)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => act("regenerate")}
            disabled={busy}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
          >
            Regenerate secret
          </button>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">
            Regenerating invalidates the old secret — update the webhook in GitHub afterward.
          </p>

          {view.lastDeliveryAt && (
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              Last delivery: {new Date(view.lastDeliveryAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Off — the live page only updates on a manual Sync. Enable to auto-sync on every push.
        </p>
      )}
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

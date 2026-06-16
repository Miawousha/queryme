# Content settings — App-first UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Content settings page so the GitHub App is the primary auto-sync path, demoting the manual repo-URL form and manual webhook into collapsed "Advanced" disclosures, and making "Connect with GitHub App" the primary CTA in the empty state.

**Architecture:** Pure presentation/IA change over the existing client components plus one derived field on an existing API view. Extract the manual sync form into a shared `ManualSyncForm` so it can render both in the empty-state onboarding and under "Advanced". `AutoSyncPanel` becomes a three-case status block (connected-via-App / not-connected-with-install-URL / no-App-configured) that demotes the manual webhook under a `<details>` whenever an App install URL exists.

**Tech Stack:** Next.js (App Router, server + `"use client"` components), React, TypeScript, Tailwind utility classes, Vitest + React Testing Library + `@testing-library/user-event`.

**Spec:** `docs/superpowers/specs/2026-06-16-content-settings-app-first-ui-design.md`

---

## File Structure

- `app/api/a/[username]/admin/auto-sync/route.ts` — modify: add derived `manageUrl` to `view()`.
- `components/admin/manual-sync-form.tsx` — **create**: extracted repo-URL + branch + Sync form with its own POST + error state.
- `components/admin/auto-sync-panel.tsx` — modify: three-case status block; manual webhook moved into a `ManualWebhook` sub-component rendered inline only when no App is configured, otherwise under `<details>`.
- `components/admin/kb-setup-steps.tsx` — modify: 2-step flow with a "Connect with GitHub App" CTA and a "paste the repo URL manually" disclosure that renders `ManualSyncForm`.
- `components/admin/content-tab.tsx` — modify: delegate the manual form to `ManualSyncForm`, move it under "Advanced: change source manually" when an active source exists, pass `appInstallUrl` to `KbSetupSteps`, keep its own resync + resync-error state.
- `app/[username]/admin/settings/content/page.tsx` — modify: compute `appInstallUrl()` server-side and pass it to `ContentTab`.
- Tests: `tests/app/api/a/admin-auto-sync.test.ts`, `tests/components/admin/manual-sync-form.test.tsx` (**create**), `tests/components/admin/auto-sync-panel.test.tsx`, `tests/components/admin/kb-setup-steps.test.tsx`, `tests/components/admin/content-tab.test.tsx`.

Run a single test file with: `pnpm exec vitest run <path>`. Run all: `pnpm test`.

---

### Task 1: Add `manageUrl` to the auto-sync API view

**Files:**
- Modify: `app/api/a/[username]/admin/auto-sync/route.ts` (the `view()` function, ~lines 18-28)
- Test: `tests/app/api/a/admin-auto-sync.test.ts` (lines 65-94)

- [ ] **Step 1: Update the failing assertions**

In `tests/app/api/a/admin-auto-sync.test.ts`, replace the body of the "GET returns the view with revealed secret + webhook URL" test's `toEqual` (currently lines 77-85) so it expects the new field:

```ts
    expect(await res.json()).toEqual({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeef",
      lastDeliveryAt: null,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
```

And extend the "GET reports not-configured when no row exists" test (line 92-93) to assert the null case:

```ts
    expect(body).toMatchObject({ enabled: false, configured: false, secret: null, manageUrl: null });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/app/api/a/admin-auto-sync.test.ts`
Expected: FAIL — the "GET returns the view" test reports a missing `manageUrl` key.

- [ ] **Step 3: Add `manageUrl` to `view()`**

In `app/api/a/[username]/admin/auto-sync/route.ts`, replace the `view()` return object so it reads:

```ts
function view(username: string, config: PersonaAutoSync | null) {
  return {
    enabled: config?.enabled ?? false,
    configured: config !== null,
    webhookUrl: webhookUrlFor(username),
    secret: config?.secret ?? null,
    lastDeliveryAt: config?.lastDeliveryAt ?? null,
    connectedViaApp: Boolean(config?.installationId),
    manageUrl: config?.installationId
      ? `https://github.com/settings/installations/${config.installationId}`
      : null,
    appInstallUrl: appInstallUrl(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/app/api/a/admin-auto-sync.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add app/api/a/[username]/admin/auto-sync/route.ts tests/app/api/a/admin-auto-sync.test.ts
git commit -m "feat(content-ui): expose manageUrl on the auto-sync view"
```

---

### Task 2: Extract `ManualSyncForm`

A shared client component holding the repo-URL + branch + Sync form, its own POST, and its own error display. Extracted from `ContentTab` so both the empty-state onboarding and the "Advanced" disclosure can reuse it.

**Files:**
- Create: `components/admin/manual-sync-form.tsx`
- Test: `tests/components/admin/manual-sync-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/manual-sync-form.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";

afterEach(() => vi.unstubAllGlobals());

describe("ManualSyncForm", () => {
  it("POSTs the repo URL and branch, then calls onSynced", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commitSha: "abc" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSynced = vi.fn();

    render(<ManualSyncForm apiBasePath="/api/a/alex/admin" onSynced={onSynced} />);
    await userEvent.type(
      screen.getByLabelText(/repo url/i),
      "https://github.com/alex/queritae-content",
    );
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/a/alex/admin/persona-source",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("shows the error and does not call onSynced when the sync fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "clone failed" }) }),
    );
    const onSynced = vi.fn();

    render(<ManualSyncForm apiBasePath="/api/a/alex/admin" onSynced={onSynced} />);
    await userEvent.type(screen.getByLabelText(/repo url/i), "https://github.com/alex/x");
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await screen.findByText("clone failed");
    expect(onSynced).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/manual-sync-form.test.tsx`
Expected: FAIL — `Cannot find module '@/components/admin/manual-sync-form'`.

- [ ] **Step 3: Create the component**

Create `components/admin/manual-sync-form.tsx`:

```tsx
"use client";

import { useState } from "react";

export function ManualSyncForm({
  apiBasePath,
  onSynced,
  defaultBranch = "main",
}: {
  apiBasePath: string;
  onSynced: () => void | Promise<void>;
  defaultBranch?: string;
}) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const sync = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    setLastError(null);
    const res = await fetch(`${apiBasePath}/persona-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: url, branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setLastError(body.error ?? "Sync failed");
    } else {
      setUrl("");
      await onSynced();
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={sync} className="mt-2 space-y-2">
      <label className="block text-sm">
        <span className="block text-xs text-[var(--color-text-tertiary)]">Repo URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://github.com/<owner>/<repo>"
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="block text-xs text-[var(--color-text-tertiary)]">Branch</span>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={submitting || !url}
        className="rounded border border-[var(--color-border)] px-3 py-1 text-xs"
      >
        {submitting ? "Syncing…" : "Sync"}
      </button>
      {lastError && <p className="mt-2 text-sm text-red-500">{lastError}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/manual-sync-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/manual-sync-form.tsx tests/components/admin/manual-sync-form.test.tsx
git commit -m "feat(content-ui): extract shared ManualSyncForm component"
```

---

### Task 3: Restructure `AutoSyncPanel` into App-first status block

**Files:**
- Modify: `components/admin/auto-sync-panel.tsx` (full rewrite)
- Test: `tests/components/admin/auto-sync-panel.test.tsx`

- [ ] **Step 1: Update + add failing tests**

In `tests/components/admin/auto-sync-panel.test.tsx`, replace the "shows connected status when connected via the App" test (lines 69-84) with the following, and append three new tests before the closing `});` of the `describe`:

```tsx
  it("connected via App: shows status, Manage on GitHub, and demotes the webhook under Advanced", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByText(/connected via github app/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /connect with github app/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage on github/i })).toHaveAttribute(
      "href",
      "https://github.com/settings/installations/inst-9",
    );
    // The secret still exists in the DOM but only inside the collapsed Advanced disclosure.
    expect(screen.getByText("deadbeefsecret").closest("details")).not.toBeNull();
  });

  it("connected via App but disabled: shows paused and an Enable button", async () => {
    stubFetch({
      enabled: false,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/paused/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("not connected with an install URL: demotes the manual webhook under Advanced", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await screen.findByRole("link", { name: /connect with github app/i });
    expect(screen.getByText("deadbeefsecret").closest("details")).not.toBeNull();
  });

  it("no install URL configured: shows the manual webhook inline (not demoted)", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: "deadbeefsecret",
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/deadbeefsecret/)).toBeInTheDocument());
    expect(screen.getByText("deadbeefsecret").closest("details")).toBeNull();
    expect(screen.queryByRole("link", { name: /connect with github app/i })).not.toBeInTheDocument();
  });
```

Also update the first two existing tests' stub objects ("shows the webhook URL and secret when enabled" and "shows only an Enable button when disabled") and the third ("Connect with GitHub App") to include `manageUrl: null` alongside the existing fields, so the stubs match the `View` type. (Add the single line `manageUrl: null,` to each of those three `stubFetch({...})` calls.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/auto-sync-panel.test.tsx`
Expected: FAIL — no "Manage on GitHub" link, and the secret is not inside a `<details>` (current component renders it inline).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `components/admin/auto-sync-panel.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";

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
        lastDeliveryAt={view.lastDeliveryAt}
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

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Auto-sync
        </h2>
        {toggle}
      </div>

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
          {view.lastDeliveryAt && (
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              Last delivery: {new Date(view.lastDeliveryAt).toLocaleString()}
            </p>
          )}
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
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {webhook ?? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Off — the live page only updates on a manual Sync. Enable to
              auto-sync on every push.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ManualWebhook({
  webhookUrl,
  secret,
  lastDeliveryAt,
  copied,
  copy,
  busy,
  onRegenerate,
}: {
  webhookUrl: string;
  secret: string;
  lastDeliveryAt: string | null;
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

      {lastDeliveryAt && (
        <p className="text-[10px] text-[var(--color-text-tertiary)]">
          Last delivery: {new Date(lastDeliveryAt).toLocaleString()}
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/auto-sync-panel.test.tsx`
Expected: PASS (all tests, including the four new/updated cases).

- [ ] **Step 5: Commit**

```bash
git add components/admin/auto-sync-panel.tsx tests/components/admin/auto-sync-panel.test.tsx
git commit -m "feat(content-ui): App-first auto-sync status; demote manual webhook"
```

---

### Task 4: Rework `KbSetupSteps` into a 2-step App-first flow

**Files:**
- Modify: `components/admin/kb-setup-steps.tsx` (full rewrite)
- Test: `tests/components/admin/kb-setup-steps.test.tsx`

- [ ] **Step 1: Rewrite the failing tests**

Replace the entire contents of `tests/components/admin/kb-setup-steps.test.tsx` with:

```tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";

const originalClipboard = navigator.clipboard;
afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: originalClipboard,
    configurable: true,
  });
});

const baseProps = {
  username: "alex",
  apiBasePath: "/api/a/alex/admin",
  onSynced: () => {},
};

describe("KbSetupSteps", () => {
  it("renders the prompt with the username and origin-correct URLs", () => {
    render(<KbSetupSteps {...baseProps} />);
    const origin = window.location.origin;
    const prompt = screen.getByTestId("setup-prompt");
    expect(prompt.textContent).toContain(`${origin}/alex`);
    expect(prompt.textContent).toContain(`${origin}/setup-guide.md`);
    expect(prompt.textContent).toContain("Queritae knowledge base");
  });

  it("shows Connect with GitHub App as the primary step when an install URL is given", () => {
    render(
      <KbSetupSteps
        {...baseProps}
        appInstallUrl="https://github.com/apps/queritae/installations/new"
      />,
    );
    expect(screen.getByText(/build your content repo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect with github app/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/queritae/installations/new",
    );
    // The manual paste form is still reachable (inside a disclosure).
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeInTheDocument();
    const guideLink = screen.getByRole("link", { name: /read the setup guide/i });
    expect(guideLink).toHaveAttribute("href", "/setup-guide.md");
  });

  it("falls back to the manual paste form (no App CTA) when no install URL is given", () => {
    render(<KbSetupSteps {...baseProps} />);
    expect(screen.queryByRole("link", { name: /connect with github app/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeInTheDocument();
  });

  it("copies the full prompt to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KbSetupSteps {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(`${window.location.origin}/setup-guide.md`);
    await screen.findByRole("button", { name: /copied/i });
  });

  it("shows failure feedback when the clipboard write is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<KbSetupSteps {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    await screen.findByRole("button", { name: /copy failed/i });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/kb-setup-steps.test.tsx`
Expected: FAIL — the component does not yet accept `apiBasePath`/`onSynced`/`appInstallUrl` and renders no Connect link or Sync button.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `components/admin/kb-setup-steps.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";

function buildPrompt(username: string, origin: string): string {
  return [
    `I'm setting up my Queritae knowledge base — a queryable CV that will live at ${origin}/${username}.`,
    "",
    `Fetch ${origin}/setup-guide.md and follow it exactly. Ask me for my source material (CV, LinkedIn export, portfolio links), and interview me briefly to fill gaps and capture stories. When everything passes the guide's self-checks, create a public GitHub repo, push, and give me the repo URL so I can paste it into my Queritae admin.`,
  ].join("\n");
}

// Empty-state onboarding for the Content tab: build the content repo with a
// coding agent, then connect it — one-click via the GitHub App when available,
// or by pasting the repo URL. Rendered only client-side (ContentTab shows it
// after its initial fetch), so window is available.
export function KbSetupSteps({
  username,
  apiBasePath,
  appInstallUrl,
  onSynced,
}: {
  username: string;
  apiBasePath: string;
  appInstallUrl?: string | null;
  onSynced: () => void | Promise<void>;
}) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prompt = buildPrompt(username, window.location.origin);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setFeedback("idle"), 2000);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
        Set up your knowledge base
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        The quickest way to build your KB is to let a coding agent do it —
        Claude Code, or any assistant that can fetch a URL and push to GitHub.
      </p>
      <ol className="list-decimal space-y-4 pl-5 text-sm">
        <li>
          <span className="font-medium">Build your content repo.</span> Copy this
          prompt into your coding agent.
          <div className="mt-2 rounded border border-[var(--color-border)] p-2">
            <pre
              data-testid="setup-prompt"
              className="whitespace-pre-wrap font-sans text-xs text-[var(--color-text-secondary)]"
            >
              {prompt}
            </pre>
            <button
              type="button"
              onClick={copy}
              className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
            >
              <span aria-live="polite">
                {feedback === "copied"
                  ? "Copied"
                  : feedback === "failed"
                    ? "Copy failed"
                    : "Copy prompt"}
              </span>
            </button>
          </div>
        </li>
        <li>
          <span className="font-medium">Connect it.</span>
          {appInstallUrl ? (
            <div className="mt-2 space-y-2">
              <a
                href={appInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                Connect with GitHub App
              </a>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">
                One click installs auto-sync and syncs your repo automatically.
              </p>
              <details>
                <summary className="cursor-pointer text-xs text-[var(--color-text-tertiary)]">
                  or paste the repo URL manually
                </summary>
                <ManualSyncForm apiBasePath={apiBasePath} onSynced={onSynced} />
              </details>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Paste the repo URL and Sync. If the sync fails, paste the error
                back into your agent.
              </p>
              <ManualSyncForm apiBasePath={apiBasePath} onSynced={onSynced} />
            </div>
          )}
        </li>
      </ol>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Prefer to write it by hand?{" "}
        <a href="/setup-guide.md" target="_blank" rel="noreferrer" className="underline">
          Read the setup guide
        </a>
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/kb-setup-steps.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/kb-setup-steps.tsx tests/components/admin/kb-setup-steps.test.tsx
git commit -m "feat(content-ui): 2-step App-first empty state with Connect CTA"
```

---

### Task 5: Update `ContentTab` to use `ManualSyncForm` and pass `appInstallUrl`

**Files:**
- Modify: `components/admin/content-tab.tsx` (full rewrite)
- Test: `tests/components/admin/content-tab.test.tsx` (add two tests)

- [ ] **Step 1: Add the failing tests**

In `tests/components/admin/content-tab.test.tsx`, append these two tests before the final `});` that closes the `describe`:

```tsx
  it("exposes the manual change-source form only under an Advanced disclosure when a source exists", async () => {
    stubPersonaSource(ACTIVE_ROW);
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    const url = await screen.findByLabelText(/repo url/i);
    expect(url.closest("details")).not.toBeNull();
    expect(screen.getByText(/advanced: change source manually/i)).toBeInTheDocument();
  });

  it("passes appInstallUrl down to the empty-state Connect CTA", async () => {
    stubPersonaSource(null);
    render(
      <ContentTab
        apiBasePath="/api/a/alex/admin"
        username="alex"
        appInstallUrl="https://github.com/apps/queritae/installations/new"
      />,
    );
    const link = await screen.findByRole("link", { name: /connect with github app/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/queritae/installations/new");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/content-tab.test.tsx`
Expected: FAIL — the change-source input is not inside a `<details>`, and `ContentTab` does not accept/forward `appInstallUrl`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `components/admin/content-tab.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PersonaSource } from "@/lib/db/schema";
import { KbSetupSteps } from "@/components/admin/kb-setup-steps";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";

type State = { active: PersonaSource | null; history: PersonaSource[] };

export function ContentTab({
  apiBasePath,
  username,
  appInstallUrl,
}: {
  apiBasePath: string;
  username: string;
  appInstallUrl?: string | null;
}) {
  const [state, setState] = useState<State | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch(`${apiBasePath}/persona-source`);
    if (res.ok) setState(await res.json());
  };

  useEffect(() => {
    void reload();
  }, []);

  const resync = async () => {
    if (!state?.active) return;
    setResyncing(true);
    setResyncError(null);
    const res = await fetch(`${apiBasePath}/persona-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: state.active.repoUrl, branch: state.active.branch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setResyncError(body.error ?? "Resync failed");
    } else {
      await reload();
    }
    setResyncing(false);
  };

  if (!state) {
    return <div className="p-4 text-sm text-[var(--color-text-tertiary)]">Loading…</div>;
  }

  return (
    <div className="space-y-6 p-4">
      {state.active ? (
        <>
          <section>
            <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
              Active source
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <div>
                <span className="text-[var(--color-text-tertiary)]">repo: </span>
                <a
                  href={state.active.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {prettyRepo(state.active.repoUrl)}
                </a>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">branch: </span>
                {state.active.branch}
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">commit: </span>
                <code className="text-xs">{state.active.commitSha.slice(0, 7)}</code>
              </div>
              <div>
                <span className="text-[var(--color-text-tertiary)]">last synced: </span>
                {new Date(state.active.syncedAt).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={resync}
                disabled={resyncing}
                className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                {resyncing ? "Syncing…" : "Resync from current source"}
              </button>
              {resyncError && <p className="mt-2 text-sm text-red-500">{resyncError}</p>}
            </div>
          </section>

          <section>
            <details>
              <summary className="cursor-pointer font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
                Advanced: change source manually
              </summary>
              <ManualSyncForm
                apiBasePath={apiBasePath}
                onSynced={reload}
                defaultBranch={state.active.branch}
              />
            </details>
          </section>
        </>
      ) : (
        <section>
          <KbSetupSteps
            username={username}
            apiBasePath={apiBasePath}
            appInstallUrl={appInstallUrl}
            onSynced={reload}
          />
        </section>
      )}

      <section>
        <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          Sync history
        </h2>
        <ul className="mt-2 space-y-1 text-xs">
          {state.history.map((row) => (
            <li key={row.id} className="flex gap-3">
              <span>{new Date(row.syncedAt).toLocaleString()}</span>
              <span className={row.status === "ok" ? "text-emerald-500" : "text-red-500"}>
                {row.status}
              </span>
              {row.error && (
                <span className="text-[var(--color-text-tertiary)]">{row.error}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function prettyRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/content-tab.test.tsx`
Expected: PASS (all tests — the four original plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add components/admin/content-tab.tsx tests/components/admin/content-tab.test.tsx
git commit -m "feat(content-ui): demote manual source form under Advanced; thread appInstallUrl"
```

---

### Task 6: Wire `appInstallUrl` from the page

**Files:**
- Modify: `app/[username]/admin/settings/content/page.tsx`

- [ ] **Step 1: Update the page to pass `appInstallUrl`**

Replace the entire contents of `app/[username]/admin/settings/content/page.tsx` with:

```tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ContentTab } from "@/components/admin/content-tab";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";
import { appInstallUrl } from "@/lib/github-app/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const apiBasePath = `/api/a/${account.username}/admin`;
  return (
    <>
      <ContentTab
        apiBasePath={apiBasePath}
        username={account.username}
        appInstallUrl={appInstallUrl()}
      />
      <AutoSyncPanel apiBasePath={apiBasePath} />
    </>
  );
}
```

- [ ] **Step 2: Type-check the touched files**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors). If `tsc` is not wired for the project, run `pnpm build` instead and expect a successful compile.

- [ ] **Step 3: Commit**

```bash
git add app/[username]/admin/settings/content/page.tsx
git commit -m "feat(content-ui): pass appInstallUrl into the Content tab"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including `manual-sync-form`, `auto-sync-panel`, `kb-setup-steps`, `content-tab`, and `admin-auto-sync`.

- [ ] **Step 2: Verify in the browser preview**

Start the dev server (preview_start) and open the Content settings page for the signed-in admin account (`/<username>/admin/settings/content`). Because the local account is connected via the App, confirm:
- the "Connected via GitHub App ✓" status shows, with a "Manage on GitHub" link and no inline Payload URL / Secret;
- expanding "Advanced: manual webhook" reveals the webhook details;
- the manual "Update source" form is only under "Advanced: change source manually".

Capture a screenshot (preview_screenshot) as proof.

- [ ] **Step 3: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(content-ui): verify App-first Content settings pass"
```

---

## Notes for the implementer

- The `View` type in `auto-sync-panel.tsx` must include `manageUrl: string | null` (Task 3) to match the API change from Task 1 — keep these in sync.
- `ManualSyncForm` owns its own error display; `ContentTab` keeps a separate `resyncError` only for the "Resync from current source" button.
- jsdom keeps the contents of a collapsed `<details>` in the DOM, so tests assert demotion via `element.closest("details")` rather than `not.toBeInTheDocument()`.
- Tailwind color tokens used (`--color-border`, `--color-text-tertiary`, `--color-text-secondary`, `--color-accent`) already exist in the codebase — reuse them, do not introduce new ones.
- **Deferred (out of scope):** the spec's edge case of showing "Connected via GitHub App — finishing first sync" in the Content tab when App-connected but no `persona_source` row exists yet. `ContentTab` does not receive `connectedViaApp` (it fetches `/persona-source`, not `/auto-sync`), and its empty state already shows the non-alarming "Set up your knowledge base" steps rather than a "not configured" error — so no misleading copy appears. Implementing the nicer transient copy would mean threading the auto-sync state into `ContentTab`; deferred alongside the known post-install "Connect until refresh" race, which the spec also lists as out of scope.

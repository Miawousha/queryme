import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";

function stubFetch(view: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(view), { status: 200 })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AutoSyncPanel", () => {
  it("shows the webhook URL and secret when enabled", async () => {
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
    await waitFor(() =>
      expect(screen.getByText(/sync-webhook/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/deadbeefsecret/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate secret/i })).toBeInTheDocument();
  });

  it("shows only an Enable button when disabled", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: null,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument(),
    );
    // Secret is not revealed while disabled.
    expect(screen.queryByText(/sync-webhook/)).not.toBeInTheDocument();
    // With no install URL, the GitHub App block is absent entirely.
    expect(screen.queryByText(/github app/i)).not.toBeInTheDocument();
  });

  it("shows the Connect with GitHub App button when an install URL is present and not connected", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      webhookUrl: "https://queritae.com/api/a/alex/sync-webhook",
      secret: null,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    const link = await screen.findByRole("link", { name: /connect with github app/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/queritae/installations/new");
  });

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
});

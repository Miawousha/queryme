import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";

function stubFetch(view: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(view), { status: 200 })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AutoSyncPanel", () => {
  it("shows only an Enable button when disabled and no install URL", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument(),
    );
    // With no install URL, the GitHub App block is absent entirely.
    expect(screen.queryByText(/github app/i)).not.toBeInTheDocument();
  });

  it("shows the Connect with GitHub App button when an install URL is present and not connected", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    const link = await screen.findByRole("link", { name: /connect with github app/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/queritae/installations/new");
  });

  it("connected via App: shows status and Manage on GitHub", async () => {
    stubFetch({
      enabled: true,
      configured: true,
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
  });

  it("connected via App and enabled: renders Last delivery exactly once", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      lastDeliveryAt: "2026-06-16T12:00:00.000Z",
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() =>
      expect(screen.getByText(/connected via github app/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/last delivery/i)).toHaveLength(1);
  });

  it("connected via App but disabled: shows paused and an Enable button", async () => {
    stubFetch({
      enabled: false,
      configured: true,
      lastDeliveryAt: null,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/paused/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("not connected, disabled, install URL present: shows the Connect CTA and the Off fallback", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await screen.findByRole("link", { name: /connect with github app/i });
    expect(screen.getByText(/off — connect the app above/i)).toBeInTheDocument();
  });

  it("shows the last delivery time in the no-App path", async () => {
    stubFetch({
      enabled: true,
      configured: true,
      lastDeliveryAt: "2026-06-16T10:00:00.000Z",
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: null,
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/last delivery:/i)).toBeInTheDocument());
    expect(screen.getAllByText(/last delivery:/i)).toHaveLength(1);
  });

  it("shows a 'finishing setup' hint right after a fresh install when not yet connected", async () => {
    stubFetch({
      enabled: false,
      configured: false,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    });
    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" justInstalled />);
    expect(await screen.findByText(/finishing setup/i)).toBeInTheDocument();
  });

  it("re-fetches once after a fresh install and reflects the new App connection", async () => {
    vi.useFakeTimers();
    const notConnected = {
      enabled: false,
      configured: false,
      lastDeliveryAt: null,
      connectedViaApp: false,
      manageUrl: null,
      appInstallUrl: "https://github.com/apps/queritae/installations/new",
    };
    const connected = {
      ...notConnected,
      enabled: true,
      configured: true,
      connectedViaApp: true,
      manageUrl: "https://github.com/settings/installations/inst-9",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(notConnected), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(connected), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AutoSyncPanel apiBasePath="/api/a/alex/admin" justInstalled />);
    await act(async () => {}); // flush the initial load's promise chain
    expect(screen.getByText(/finishing setup/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // past the one delayed re-fetch
    });
    expect(screen.getByText(/connected via github app/i)).toBeInTheDocument();
    expect(screen.queryByText(/finishing setup/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

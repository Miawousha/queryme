import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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

// Copy now mints a short-lived setup token before assembling the prompt, so
// every path that reaches the clipboard needs fetch stubbed. Default: ok.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "setup.x.y.z", expiresAt: Date.now() + 60000 }),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const baseProps = {
  username: "alex",
  apiBasePath: "/api/a/alex/admin",
  onSynced: () => {},
};

describe("KbSetupSteps", () => {
  it("renders the build-repo step with token-aware helper text", () => {
    render(<KbSetupSteps {...baseProps} />);
    // The static prompt preview is gone — the prompt is only assembled at copy
    // time because it carries a live token. The step + helper text remain.
    expect(screen.getByText(/build your content repo/i)).toBeInTheDocument();
    expect(
      screen.getByText(/includes a one-time credential so your agent can register the repo/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("setup-prompt")).not.toBeInTheDocument();
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

  it("mints a token and copies the full prompt to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KbSetupSteps {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Authorization: Bearer setup.x.y.z");
    expect(copied).toContain(`${window.location.origin}/setup-guide.md`);
    await screen.findByRole("button", { name: /copied/i });
  });

  it("shows failure feedback when the clipboard write is rejected", async () => {
    // fetch resolves ok (default), so the flow reaches the clipboard, which rejects.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<KbSetupSteps {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    await screen.findByRole("button", { name: /copy failed/i });
  });

  it("shows failure feedback when the token mint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KbSetupSteps {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(writeText).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: /copy failed/i });
  });
});

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

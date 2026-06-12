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

describe("KbSetupSteps", () => {
  it("renders the prompt with the username and origin-correct URLs", () => {
    render(<KbSetupSteps username="alex" />);
    const origin = window.location.origin;
    const prompt = screen.getByTestId("setup-prompt");
    expect(prompt.textContent).toContain(`${origin}/alex`);
    expect(prompt.textContent).toContain(`${origin}/setup-guide.md`);
    expect(prompt.textContent).toContain("Queritae knowledge base");
  });

  it("renders the three steps and the manual-path link", () => {
    render(<KbSetupSteps username="alex" />);
    expect(screen.getByText(/copy this prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/builds your content repo/i)).toBeInTheDocument();
    expect(screen.getByText(/paste the repo url below/i)).toBeInTheDocument();
    const guideLink = screen.getByRole("link", { name: /read the setup guide/i });
    expect(guideLink).toHaveAttribute("href", "/setup-guide.md");
  });

  it("copies the full prompt to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KbSetupSteps username="alex" />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(
      `${window.location.origin}/setup-guide.md`,
    );
    // Button gives feedback after copying.
    await screen.findByRole("button", { name: /copied/i });
  });

  it("shows failure feedback when the clipboard write is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<KbSetupSteps username="alex" />);
    await userEvent.click(screen.getByRole("button", { name: /copy prompt/i }));
    await screen.findByRole("button", { name: /copy failed/i });
  });
});

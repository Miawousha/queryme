import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignaturePanel } from "@/components/admin/sections/signature-panel";

describe("SignaturePanel", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("shows the ink snippet by default and switches to white", async () => {
    render(<SignaturePanel profileUrl="https://queritae.com/alex" origin="https://queritae.com" />);
    const box = screen.getByLabelText(/paste this into your email signature/i) as HTMLTextAreaElement;
    expect(box.value).toContain("queritae-ink.png");
    expect(box.value).toContain("alex?ref=signature");

    await userEvent.click(screen.getByRole("button", { name: /^white$/i }));
    expect(box.value).toContain("queritae-white.png");
  });

  it("copies the snippet to the clipboard and confirms", async () => {
    render(<SignaturePanel profileUrl="https://queritae.com/alex" origin="https://queritae.com" />);
    await userEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("queritae-ink.png"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingPage } from "@/components/landing/landing-page";

describe("LandingPage", () => {
  it("renders the concept hero and a live GitHub sign-in link", () => {
    render(<LandingPage seeItLiveUsername="Miawousha" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: /sign in with github/i });
    expect(signIn).toHaveAttribute("href", "/api/auth/github/login");
  });

  it("links 'See it live' to the account, and omits it when no account is given", () => {
    const { rerender } = render(<LandingPage seeItLiveUsername="Miawousha" />);
    expect(screen.getByRole("link", { name: /see it live/i })).toHaveAttribute(
      "href",
      "/Miawousha",
    );

    rerender(<LandingPage seeItLiveUsername={null} />);
    expect(screen.queryByRole("link", { name: /see it live/i })).toBeNull();
  });
});

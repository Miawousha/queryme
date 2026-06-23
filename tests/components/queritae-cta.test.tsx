import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueritaeCta, type QueritaeCtaStrings } from "@/components/queritae-cta";

const strings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre's queryable CV — a résumé you can interview.",
  bullets: [
    "Grounded in real career notes",
    "Agent-native — built-in MCP endpoint",
    "Your own domain",
  ],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

function renderCta() {
  return render(
    <QueritaeCta
      strings={strings}
      landingHref="/?ref=profile"
      signupHref="/api/auth/github/login"
    />,
  );
}

describe("QueritaeCta", () => {
  it("shows the wordmark pill and keeps the modal closed until clicked", () => {
    renderCta();
    const pill = screen.getByRole("button", { name: strings.title });
    expect(pill).toHaveTextContent("queritae");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the modal with the personalized pitch and value bullets", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("This is Alexandre's queryable CV");
    for (const b of strings.bullets) {
      expect(dialog).toHaveTextContent(b);
    }
  });

  it("points the primary CTA at the landing page and the secondary at GitHub signup", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    expect(screen.getByRole("link", { name: strings.exploreCta })).toHaveAttribute(
      "href",
      "/?ref=profile",
    );
    expect(screen.getByRole("link", { name: strings.signupCta })).toHaveAttribute(
      "href",
      "/api/auth/github/login",
    );
  });

  it("closes the modal via the close button", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    fireEvent.click(screen.getByRole("button", { name: strings.close }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppTopBar } from "@/components/app-top-bar";
import type { QueritaeCtaStrings } from "@/components/queritae-cta";

// ThemeToggle's effect reads window.matchMedia (absent in jsdom) UNLESS
// <html data-theme> is already set. Set it so the effect early-returns.
beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

const queritaeStrings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre's queryable CV — a résumé you can interview.",
  bullets: ["Grounded in real career notes", "Agent-native — built-in MCP endpoint", "Your own domain"],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

function baseProps() {
  return {
    name: "Ada Lovelace",
    tagline: "Queryable CV",
    lang: "en" as const,
    onLangChange: vi.fn(),
    themeToggleLabel: "Theme",
    aboutButtonLabel: "About this project",
    onOpenAbout: vi.fn(),
    kbCollapsed: false,
    onToggleKb: vi.fn(),
    kbShowLabel: "Show KB",
    kbHideLabel: "Hide KB",
    queritae: {
      strings: queritaeStrings,
      landingHref: "/?ref=profile",
      signupHref: "/api/auth/github/login",
    },
  };
}

describe("AppTopBar — Queritae CTA", () => {
  it("renders the wordmark pill and opens the platform modal", () => {
    render(<AppTopBar {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "What is Queritae?" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This is Alexandre's queryable CV");
    expect(screen.getByRole("link", { name: "Explore Queritae →" })).toHaveAttribute(
      "href",
      "/?ref=profile",
    );
  });
});

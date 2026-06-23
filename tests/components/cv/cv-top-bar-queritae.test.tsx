import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// CvTopBar uses next/navigation; stub it so the bar renders in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CvTopBar } from "@/components/cv/cv-top-bar";
import type { QueritaeCtaStrings } from "@/components/queritae-cta";

const queritaeStrings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre Collet's queryable CV — a résumé you can interview.",
  bullets: ["Grounded in real career notes", "Agent-native — built-in MCP endpoint", "Your own domain"],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

describe("CvTopBar — Queritae CTA", () => {
  it("renders the wordmark pill and opens the platform modal", () => {
    render(
      <CvTopBar
        lang="en"
        printLabel="Print / Save as PDF"
        backLabel="queritae"
        basePath="/alex"
        queritae={{
          strings: queritaeStrings,
          landingHref: "/?ref=profile",
          signupHref: "/api/auth/github/login",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "What is Queritae?" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This is Alexandre Collet's queryable CV");
    expect(screen.getByRole("link", { name: "Create yours with GitHub" })).toHaveAttribute(
      "href",
      "/api/auth/github/login",
    );
  });
});

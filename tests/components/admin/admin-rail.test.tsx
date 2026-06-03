import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminRail } from "@/components/admin/admin-rail";

const nav = vi.hoisted(() => ({ pathname: "/alex/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

beforeEach(() => {
  nav.pathname = "/alex/admin";
});

describe("AdminRail", () => {
  it("renders both groups with item links", () => {
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /conversations/i })).toHaveAttribute("href", "/alex/admin");
    expect(screen.getByRole("link", { name: /custom domains/i })).toHaveAttribute(
      "href",
      "/alex/admin/settings/domains",
    );
  });

  it("shows the unanswered badge and the conversations count", () => {
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("marks the active item from the current path", () => {
    nav.pathname = "/alex/admin/questions";
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByRole("link", { name: /questions/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /conversations/i })).not.toHaveAttribute("aria-current");
  });

  it("marks Custom domains active for a settings sub-route", () => {
    nav.pathname = "/alex/admin/settings/domains";
    render(<AdminRail adminBasePath="/alex/admin" counts={{ conversations: 12, unanswered: 3 }} />);
    expect(screen.getByRole("link", { name: /custom domains/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /conversations/i })).not.toHaveAttribute("aria-current");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminHeader } from "@/components/admin/admin-header";

// ThemeToggle's effect reads window.matchMedia (absent in jsdom) UNLESS
// <html data-theme> is already set. Set it so the effect early-returns.
beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

describe("AdminHeader", () => {
  it("renders the queryme wordmark and the account username", () => {
    render(<AdminHeader username="alex" />);
    expect(screen.getByText("queryme")).toBeInTheDocument();
    expect(screen.getByText("alex")).toBeInTheDocument();
  });
});

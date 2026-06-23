import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppTopBar, type AppTopBarProps } from "@/components/app-top-bar";

// ThemeToggle's effect reads window.matchMedia (absent in jsdom) UNLESS
// <html data-theme> is already set. Set it so the effect early-returns.
beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

function baseProps(overrides: Partial<AppTopBarProps> = {}): AppTopBarProps {
  return {
    name: "Ada Lovelace",
    tagline: "Queryable CV",
    lang: "en",
    onLangChange: vi.fn(),
    themeToggleLabel: "Theme",
    mcpButtonLabel: "MCP",
    onOpenMcp: vi.fn(),
    aboutButtonLabel: "About",
    onOpenAbout: vi.fn(),
    kbCollapsed: false,
    onToggleKb: vi.fn(),
    kbShowLabel: "Show",
    kbHideLabel: "Hide",
    ...overrides,
  };
}

describe("AppTopBar masthead", () => {
  it("renders the person's name and tagline from props, not a hardcoded value", () => {
    render(<AppTopBar {...baseProps({ name: "Ada Lovelace", tagline: "Queryable CV" })} />);
    // Name appears twice (visible eyebrow + sr-only h1); tagline likewise.
    expect(screen.getAllByText(/Ada Lovelace/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ada Lovelace — Queryable CV");
    expect(screen.queryByText(/Alexandre Collet/)).toBeNull();
  });

  it("uses the localized tagline it is given (e.g. French)", () => {
    render(<AppTopBar {...baseProps({ name: "Ada Lovelace", tagline: "CV interrogeable", lang: "fr" })} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ada Lovelace — CV interrogeable");
  });
});

describe("AppTopBar source-repo link", () => {
  it("renders an external GitHub link when sourceRepo is provided", () => {
    render(
      <AppTopBar
        {...baseProps({
          sourceRepo: { url: "https://github.com/owner/repo", label: "View CV source on GitHub" },
        })}
      />,
    );
    const link = screen.getByRole("link", { name: "View CV source on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/owner/repo");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no source-repo link when sourceRepo is null", () => {
    render(<AppTopBar {...baseProps({ sourceRepo: null })} />);
    expect(screen.queryByRole("link", { name: "View CV source on GitHub" })).toBeNull();
  });

  it("renders no source-repo link when sourceRepo is omitted", () => {
    render(<AppTopBar {...baseProps()} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("AppTopBar CV button", () => {
  it("renders a prominent CV button with a visible label when onOpenCv is provided", () => {
    const onOpenCv = vi.fn();
    render(<AppTopBar {...baseProps({ cvButtonLabel: "Open CV", onOpenCv })} />);
    const btn = screen.getByRole("button", { name: "Open CV" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("CV"); // visible text, not an icon-only control
    fireEvent.click(btn);
    expect(onOpenCv).toHaveBeenCalledTimes(1);
  });

  it("renders no CV button when onOpenCv is omitted", () => {
    render(<AppTopBar {...baseProps()} />);
    expect(screen.queryByRole("button", { name: "Open CV" })).toBeNull();
  });
});

describe("AppTopBar admin link", () => {
  it("renders an Admin link to the dashboard when adminHref is provided", () => {
    render(<AppTopBar {...baseProps({ adminHref: "/ada/admin", adminButtonLabel: "Admin" })} />);
    const link = screen.getByRole("link", { name: "Admin" });
    expect(link).toHaveAttribute("href", "/ada/admin");
  });

  it("renders no Admin link when adminHref is null (anonymous or non-owner)", () => {
    render(<AppTopBar {...baseProps({ adminHref: null, adminButtonLabel: "Admin" })} />);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("renders no Admin link when adminHref is omitted", () => {
    render(<AppTopBar {...baseProps()} />);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});

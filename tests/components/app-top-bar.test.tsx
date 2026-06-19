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

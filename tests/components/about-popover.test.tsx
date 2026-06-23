import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AboutPopover, type AboutPopoverProps } from "@/components/about-popover";

const strings: AboutPopoverProps["strings"] = {
  title: "About",
  close: "Close",
  transparency: "Everything this agent knows is in the public repo.",
  systemPrompt: "View the system prompt",
  kb: "View the knowledge base",
  repo: "GitHub repo",
  mcpDocs: "Connect from your agent (MCP docs)",
  printableCv: "Printable CV",
  report: "Report this persona",
};

function baseProps(overrides: Partial<AboutPopoverProps> = {}): AboutPopoverProps {
  return {
    open: true,
    onClose: vi.fn(),
    strings,
    // App repo — hosts the MCP docs only.
    repoUrl: "https://github.com/Miawousha/queryme",
    branch: "main",
    // Per-account content repo — hosts system prompt, KB, and the agent's knowledge.
    contentRepoUrl: "https://github.com/Miawousha/queryme-content-alex",
    contentRepoBranch: "main",
    cvHref: "/alex/cv?lang=en",
    reportHref: null,
    ...overrides,
  };
}

describe("AboutPopover links", () => {
  it("points system-prompt, KB, and repo links at the content repo", () => {
    render(<AboutPopover {...baseProps()} />);

    expect(screen.getByRole("link", { name: strings.systemPrompt })).toHaveAttribute(
      "href",
      "https://github.com/Miawousha/queryme-content-alex/blob/main/prompts/system.md",
    );
    expect(screen.getByRole("link", { name: strings.kb })).toHaveAttribute(
      "href",
      "https://github.com/Miawousha/queryme-content-alex/tree/main/kb",
    );
    expect(screen.getByRole("link", { name: strings.repo })).toHaveAttribute(
      "href",
      "https://github.com/Miawousha/queryme-content-alex",
    );
  });

  it("points the MCP-docs link at the app repo, not the content repo", () => {
    render(<AboutPopover {...baseProps()} />);
    expect(screen.getByRole("link", { name: strings.mcpDocs })).toHaveAttribute(
      "href",
      "https://github.com/Miawousha/queryme/blob/main/docs/MCP.md",
    );
  });

  it("honours the content repo's own branch", () => {
    render(<AboutPopover {...baseProps({ contentRepoBranch: "production" })} />);
    expect(screen.getByRole("link", { name: strings.systemPrompt })).toHaveAttribute(
      "href",
      "https://github.com/Miawousha/queryme-content-alex/blob/production/prompts/system.md",
    );
  });

  it("normalizes a trailing slash or .git suffix on the content repo URL", () => {
    render(
      <AboutPopover
        {...baseProps({ contentRepoUrl: "https://github.com/owner/repo.git" })}
      />,
    );
    expect(screen.getByRole("link", { name: strings.systemPrompt })).toHaveAttribute(
      "href",
      "https://github.com/owner/repo/blob/main/prompts/system.md",
    );
    expect(screen.getByRole("link", { name: strings.repo })).toHaveAttribute(
      "href",
      "https://github.com/owner/repo",
    );
  });

  it("omits content-repo links when no content repo is configured", () => {
    render(
      <AboutPopover {...baseProps({ contentRepoUrl: null, contentRepoBranch: null })} />,
    );
    expect(screen.queryByRole("link", { name: strings.systemPrompt })).toBeNull();
    expect(screen.queryByRole("link", { name: strings.kb })).toBeNull();
    expect(screen.queryByRole("link", { name: strings.repo })).toBeNull();
    // App-repo and internal links remain.
    expect(screen.getByRole("link", { name: strings.mcpDocs })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: strings.printableCv })).toHaveAttribute(
      "href",
      "/alex/cv?lang=en",
    );
  });
});

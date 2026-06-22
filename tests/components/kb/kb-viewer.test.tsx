/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KbViewer } from "@/components/kb/kb-viewer";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";
import type { KbFile } from "@/lib/kb/manifest";

// Keep the real module exports, stub useKb so we can inject a content repo.
vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

// A pdf file dodges the text-fetch effect (needsText === false) so the test
// exercises only the toolbar's GitHub "document" link.
const FILE: KbFile = { path: "experience/ion.pdf", title: "ION", type: "pdf" };

function setContext(overrides: Parameters<typeof makeKbContext>[0]) {
  vi.mocked(useKb).mockReturnValue(makeKbContext(overrides));
}

describe("KbViewer — GitHub document link", () => {
  beforeEach(() => {
    vi.mocked(useKb).mockReset();
    vi.restoreAllMocks();
  });

  it("opens the document in the content repo, not the app repo", () => {
    setContext({
      contentRepoUrl: "https://github.com/Miawousha/queryme-content-alex",
      contentRepoBranch: "main",
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<KbViewer file={FILE} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/Miawousha/queryme-content-alex/blob/main/kb/experience/ion.pdf",
      "_blank",
      "noopener",
    );
  });

  it("honours the content repo's own branch", () => {
    setContext({
      contentRepoUrl: "https://github.com/owner/repo",
      contentRepoBranch: "production",
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<KbViewer file={FILE} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/owner/repo/blob/production/kb/experience/ion.pdf",
      "_blank",
      "noopener",
    );
  });

  it("normalizes a trailing slash or .git suffix on the content repo URL", () => {
    setContext({
      contentRepoUrl: "https://github.com/owner/repo.git",
      contentRepoBranch: "main",
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<KbViewer file={FILE} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/owner/repo/blob/main/kb/experience/ion.pdf",
      "_blank",
      "noopener",
    );
  });

  it("hides the GitHub action entirely when no content repo is configured", () => {
    setContext({ contentRepoUrl: null, contentRepoBranch: null });

    render(<KbViewer file={FILE} onBack={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "GitHub" })).toBeNull();
    // Other toolbar actions remain.
    expect(screen.getByRole("button", { name: "Download document" })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ContentTab } from "@/components/admin/content-tab";

function stubPersonaSource(active: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ active, history: [] }), { status: 200 }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ContentTab empty state", () => {
  it("shows the agent setup steps when no source is configured", async () => {
    stubPersonaSource(null);
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    await waitFor(() =>
      expect(screen.getByText(/set up your knowledge base/i)).toBeInTheDocument(),
    );
    // Prompt is personalized and the sync form is still present as step 3.
    expect(screen.getByTestId("setup-prompt").textContent).toContain("/alex");
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeInTheDocument();
    expect(screen.queryByText(/active source/i)).not.toBeInTheDocument();
  });

  it("shows the active source instead of the setup steps once configured", async () => {
    stubPersonaSource({
      id: "ps1",
      repoUrl: "https://github.com/alex/queritae-content",
      branch: "main",
      commitSha: "abc1234def",
      syncedAt: "2026-06-12T00:00:00.000Z",
      status: "ok",
      error: null,
    });
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    await waitFor(() =>
      expect(screen.getByText(/active source/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("alex/queritae-content")).toBeInTheDocument();
    expect(screen.queryByText(/set up your knowledge base/i)).not.toBeInTheDocument();
  });
});

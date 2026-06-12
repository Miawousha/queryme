import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentTab } from "@/components/admin/content-tab";

const ACTIVE_ROW = {
  id: "ps1",
  repoUrl: "https://github.com/alex/queritae-content",
  branch: "main",
  commitSha: "abc1234def",
  syncedAt: "2026-06-12T00:00:00.000Z",
  status: "ok",
  error: null,
};

function stubPersonaSource(active: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ active, history: [] }), { status: 200 }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ContentTab", () => {
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
    stubPersonaSource(ACTIVE_ROW);
    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    await waitFor(() =>
      expect(screen.getByText(/active source/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("alex/queritae-content")).toBeInTheDocument();
    // Short SHA appears in the active panel.
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.queryByText(/set up your knowledge base/i)).not.toBeInTheDocument();
  });

  it("submits a sync POST when the form is filled in", async () => {
    const fetchMock = vi
      .fn()
      // 1st call: initial GET (no active)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ active: null, history: [] }) })
      // 2nd call: POST returning the new row
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commitSha: "def", syncedAt: new Date().toISOString() }) })
      // 3rd call: refresh GET after the POST returns
      .mockResolvedValueOnce({ ok: true, json: async () => ({ active: ACTIVE_ROW, history: [ACTIVE_ROW] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ContentTab apiBasePath="/api/a/alex/admin" username="alex" />);
    const url = await screen.findByLabelText(/repo url/i);
    await userEvent.type(url, "https://github.com/alex/queritae-content");
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/a/alex/admin/persona-source",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

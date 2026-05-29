import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentTab } from "@/components/admin/content-tab";

const ACTIVE_ROW = {
  id: "x",
  repoUrl: "https://github.com/alex/queryme-content",
  branch: "main",
  commitSha: "abc1234567890abcdef1234567890abcdef12345",
  status: "ok",
  error: null,
  syncedAt: new Date("2026-05-28T12:00:00Z").toISOString(),
};

describe("ContentTab", () => {
  it("renders the active source", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: ACTIVE_ROW, history: [ACTIVE_ROW] }),
    }) as unknown as typeof fetch;

    render(<ContentTab />);
    await waitFor(() => {
      expect(screen.getByText("alex/queryme-content")).toBeInTheDocument();
      // Short SHA appears in the active panel
      expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    });
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
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ContentTab />);
    const url = await screen.findByLabelText(/repo url/i);
    await userEvent.type(url, "https://github.com/alex/queryme-content");
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/persona-source",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

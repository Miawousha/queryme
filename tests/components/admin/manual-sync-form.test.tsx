import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualSyncForm } from "@/components/admin/manual-sync-form";

afterEach(() => vi.unstubAllGlobals());

describe("ManualSyncForm", () => {
  it("POSTs the repo URL and branch, then calls onSynced", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commitSha: "abc" }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSynced = vi.fn();

    render(<ManualSyncForm apiBasePath="/api/a/alex/admin" onSynced={onSynced} />);
    await userEvent.type(
      screen.getByLabelText(/repo url/i),
      "https://github.com/alex/queritae-content",
    );
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/a/alex/admin/persona-source",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("shows the error and does not call onSynced when the sync fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "clone failed" }) }),
    );
    const onSynced = vi.fn();

    render(<ManualSyncForm apiBasePath="/api/a/alex/admin" onSynced={onSynced} />);
    await userEvent.type(screen.getByLabelText(/repo url/i), "https://github.com/alex/x");
    await userEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await screen.findByText("clone failed");
    expect(onSynced).not.toHaveBeenCalled();
  });
});

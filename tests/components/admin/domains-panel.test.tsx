import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DomainsPanel } from "@/components/admin/domains-panel";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domains: [
            {
              id: "d1",
              hostname: "cv.alex.com",
              status: "pending",
              instructions: { type: "CNAME", name: "cv", value: "cname.vercel-dns.com" },
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("DomainsPanel", () => {
  it("lists domains fetched from the API with their status and DNS target", async () => {
    render(<DomainsPanel apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText("cv.alex.com")).toBeInTheDocument());
    expect(screen.getByText(/cname\.vercel-dns\.com/)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });
});

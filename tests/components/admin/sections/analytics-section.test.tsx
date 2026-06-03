import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AnalyticsSection } from "@/components/admin/sections/analytics-section";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          perDay: [{ date: "2026-05-22", count: 3 }],
          topics: [{ topic: "salary", count: 2 }],
          density: [{ conversationId: "abcdef12", assistantTurns: 4, avgCitations: 1.5 }],
        }),
        { status: 200 },
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("AnalyticsSection", () => {
  it("fetches analytics and renders the sections", async () => {
    render(<AnalyticsSection apiBasePath="/api/a/alex/admin" />);
    await waitFor(() => expect(screen.getByText(/conversations per day/i)).toBeInTheDocument());
    expect(screen.getByText("salary")).toBeInTheDocument();
    expect(screen.getByText(/citation density/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/a/alex/admin/analytics");
  });
});

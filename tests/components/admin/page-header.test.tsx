import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/admin/page-header";

describe("PageHeader", () => {
  it("renders the title as a level-1 heading", () => {
    render(<PageHeader title="Conversations" />);
    expect(screen.getByRole("heading", { level: 1, name: "Conversations" })).toBeInTheDocument();
  });

  it("renders the eyebrow and description when provided", () => {
    render(
      <PageHeader eyebrow="Activity" title="Conversations" description="Every chat answered." />,
    );
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Every chat answered.")).toBeInTheDocument();
  });

  it("omits the eyebrow and description when not provided", () => {
    render(<PageHeader title="Billing" />);
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    // Only the heading should be present in the header's text content.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Billing");
  });

  it("renders an actions slot", () => {
    render(<PageHeader title="Conversations" actions={<button>Export</button>} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });
});

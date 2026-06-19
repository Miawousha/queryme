import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// useKb is mocked so the modal can render without <KbProvider>.
const { ctxRef } = vi.hoisted(() => ({ ctxRef: { current: null as unknown } }));
vi.mock("@/components/kb/kb-context", () => ({ useKb: () => ctxRef.current }));
// Stub the document body so the modal test doesn't hit the network.
vi.mock("@/components/cv/cv-document-client", () => ({
  CvDocumentClient: ({ lang }: { lang: string }) => <div data-testid="cv-doc">{lang}</div>,
}));

import { CvModal } from "@/components/cv/cv-modal";
import { makeKbContext } from "../../helpers/kb-fixtures";

beforeEach(() => {
  ctxRef.current = makeKbContext();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CvModal", () => {
  it("renders nothing when closed", () => {
    render(<CvModal open={false} onClose={vi.fn()} onLangChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the document and toolbar actions when open", () => {
    render(<CvModal open onClose={vi.fn()} onLangChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("cv-doc")).toBeInTheDocument();
    expect(screen.getByLabelText("Download document")).toBeInTheDocument();
    expect(screen.getByLabelText("Share a link to this CV")).toBeInTheDocument();
    expect(screen.getByLabelText("Print or save as PDF")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CvModal open onClose={onClose} onLangChange={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Share copies the public link when the Web Share API is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    // No navigator.share in jsdom → falls back to clipboard.
    render(<CvModal open onClose={vi.fn()} onLangChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Share a link to this CV"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/cv?lang=en");
  });
});

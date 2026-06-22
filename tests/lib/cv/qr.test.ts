import { describe, it, expect, vi, beforeEach } from "vitest";

const toString = vi.fn();
vi.mock("qrcode", () => ({ default: { toString } }));

beforeEach(() => vi.clearAllMocks());

describe("qrSvg", () => {
  it("returns an svg string with dark modules themed to currentColor", async () => {
    // Mirror qrcode@1.5.4's real SVG output, which strokes (not fills) the modules.
    toString.mockResolvedValue('<svg viewBox="0 0 5 5"><path stroke="#000000" d="M0 0h1v1H0z"/></svg>');
    const { qrSvg } = await import("@/lib/cv/qr");
    const out = await qrSvg("https://x.com");
    expect(out).toContain("<svg");
    expect(out).toContain("currentColor");
    expect(out).not.toContain("#000000");
  });

  it("passes the url and svg options to the encoder", async () => {
    toString.mockResolvedValue("<svg></svg>");
    const { qrSvg } = await import("@/lib/cv/qr");
    await qrSvg("https://cv.alex.com");
    expect(toString).toHaveBeenCalledWith(
      "https://cv.alex.com",
      expect.objectContaining({ type: "svg", margin: 0 }),
    );
  });

  it("returns null when the encoder throws", async () => {
    toString.mockRejectedValue(new Error("boom"));
    const { qrSvg } = await import("@/lib/cv/qr");
    expect(await qrSvg("https://x.com")).toBeNull();
  });
});

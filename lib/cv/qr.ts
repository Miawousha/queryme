import QRCode from "qrcode";

/**
 * Inline SVG QR code for `url`, themed via `currentColor` so it inherits the
 * surrounding ink (light on the dark screen view, dark on the print palette).
 * Transparent background, no quiet-zone margin — the layout supplies whitespace.
 * Returns null on any encoder failure so CV rendering never breaks over a QR.
 */
export async function qrSvg(url: string): Promise<string | null> {
  try {
    const raw = await QRCode.toString(url, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#0000" },
    });
    return raw.replace(/#000000/gi, "currentColor");
  } catch {
    return null;
  }
}

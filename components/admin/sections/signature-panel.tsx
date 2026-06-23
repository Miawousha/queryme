"use client";

import { useState } from "react";
import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";
import { buildSignatureSnippet, type BadgeColor } from "@/lib/brand/signature-snippet";

const COLOR_HEX: Record<BadgeColor, string> = { ink: "#0f172a", white: "#ffffff" };

/**
 * Account-facing panel that previews the Queritae badge and emits a ready-to-
 * paste email-signature snippet. Presentational + self-contained: the host page
 * passes the already-resolved profile URL and platform origin.
 */
export function SignaturePanel({ profileUrl, origin }: { profileUrl: string; origin: string }) {
  const [color, setColor] = useState<BadgeColor>("ink");
  const [copied, setCopied] = useState<string | null>(null);

  const snippet = buildSignatureSnippet({ profileUrl, origin, color });

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — leave the value on screen to copy manually */
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex gap-3">
        <Swatch tone="light" html={queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color], size: 48, id: "q-light" })} />
        <Swatch tone="dark" html={queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color], size: 48, id: "q-dark" })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-control text-[var(--color-text-secondary)]">Badge colour</span>
        {(["ink", "white"] as BadgeColor[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-pressed={color === c}
            className={
              "rounded-md border px-3 py-1 text-control capitalize transition-colors " +
              (color === c
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sig-snippet" className="text-control text-[var(--color-text-secondary)]">
          Paste this into your email signature
        </label>
        <textarea
          id="sig-snippet"
          readOnly
          value={snippet}
          rows={4}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 font-mono text-2xs text-[var(--color-text-primary)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copy("snippet", snippet)}
            className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-control text-[var(--color-accent)] transition-opacity hover:opacity-90"
          >
            {copied === "snippet" ? "Copied" : "Copy"}
          </button>
          <a
            href={`/badge/queritae-${color}.png`}
            download
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-control text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
          >
            Download PNG
          </a>
          <button
            type="button"
            onClick={() => copy("svg", queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color] }))}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-control text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
          >
            {copied === "svg" ? "Copied" : "Copy SVG"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Swatch({ tone, html }: { tone: "light" | "dark"; html: string }) {
  return (
    <div
      className="flex h-20 w-28 items-center justify-center rounded-lg border border-[var(--color-border)]"
      style={{ background: tone === "light" ? "#ffffff" : "#0b1220" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

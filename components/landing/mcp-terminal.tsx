"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Landing-page terminal that types out an MCP `ask` exchange when scrolled
 * into view, plus a copy-the-endpoint button. Static content — the point is
 * to show that every account is an MCP server other agents can interview.
 *
 * Respects `prefers-reduced-motion` (renders the finished transcript) and
 * types only once, when the terminal first becomes visible.
 */

type Line = { kind: "cmd" | "ok" | "out"; text: string };

const LINES: Line[] = [
  { kind: "cmd", text: "connect https://queritae.com/api/mcp" },
  { kind: "ok", text: "streamable http · session open · tools: ask, forward_question" },
  { kind: "cmd", text: 'ask "Have they led a re-platform under real load?"' },
  { kind: "out", text: "{" },
  { kind: "out", text: '  "answer": "Yes — GridScale billing: a zero-downtime' },
  { kind: "out", text: "             cutover across 14 services, cited from" },
  { kind: "out", text: '             kb/experience/gridscale.md …",' },
  { kind: "out", text: '  "conversationId": "f3a9c2…"' },
  { kind: "out", text: "}" },
];

const TOTAL = LINES.reduce((n, l) => n + l.text.length, 0);

const LINE_STYLE: Record<Line["kind"], string> = {
  cmd: "text-[var(--color-text-primary)]",
  ok: "text-[var(--color-text-secondary)]",
  out: "text-[var(--color-text-secondary)]",
};

export function McpTerminal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const [started, setStarted] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started || reduce || pos >= TOTAL) return;
    const t = setTimeout(() => setPos((p) => Math.min(p + 2, TOTAL)), 14);
    return () => clearTimeout(t);
  }, [started, reduce, pos]);

  function copyEndpoint() {
    navigator.clipboard
      ?.writeText(`${window.location.origin}/api/mcp`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  const shown = reduce ? TOTAL : pos;
  const done = shown >= TOTAL;

  // Walk lines consuming the typed-character budget.
  let budget = shown;
  const rendered = LINES.map((line, i) => {
    if (budget <= 0) return null;
    const text = line.text.slice(0, budget);
    const partial = budget < line.text.length;
    budget -= line.text.length;
    return (
      <div key={i} className={`whitespace-pre ${LINE_STYLE[line.kind]}`}>
        {line.kind === "cmd" && (
          <span aria-hidden className="mr-2 text-[var(--color-accent)]">
            $
          </span>
        )}
        {line.kind === "ok" && (
          <span aria-hidden className="mr-2 text-[var(--color-accent)]">
            ✓
          </span>
        )}
        <span className={partial && !reduce ? "caret-blink" : undefined}>{text}</span>
      </div>
    );
  });

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-void)]/70 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.22em" }}
        >
          any mcp client · streamable http
        </span>
        <button
          type="button"
          onClick={copyEndpoint}
          className="rounded-full border border-[var(--color-border)] px-2.5 py-1 font-mono text-[9px] uppercase text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
          style={{ letterSpacing: "0.18em" }}
        >
          {copied ? "copied ✓" : "copy endpoint"}
        </button>
      </div>
      <div className="min-h-[230px] space-y-1 px-4 py-4 font-mono text-[12px] leading-relaxed sm:text-[12.5px]">
        {rendered}
        {done && !reduce && (
          <div aria-hidden className="caret-blink text-[var(--color-text-primary)]">
            <span className="mr-2 text-[var(--color-accent)]">$</span>
          </div>
        )}
      </div>
    </div>
  );
}

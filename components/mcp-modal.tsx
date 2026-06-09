"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/lib/use-dialog";

type McpTool = { name: string; desc: string };

export type McpModalStrings = {
  title: string;
  intro: string;
  endpointLabel: string;
  configLabel: string;
  configNote: string;
  toolsTitle: string;
  tools: readonly McpTool[];
  copy: string;
  copied: string;
  close: string;
};

export type McpModalProps = {
  open: boolean;
  onClose: () => void;
  strings: McpModalStrings;
};

const SECTION_LABEL_CLASS =
  "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

export function McpModal({ open, onClose, strings }: McpModalProps) {
  const [origin, setOrigin] = useState("");
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!open) return null;

  const endpoint = `${origin || "https://<your-deployment>"}/api/mcp`;
  const config = JSON.stringify(
    { mcpServers: { queritae: { type: "http", url: endpoint } } },
    null,
    2,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="mcp-modal-title"
            className="font-display text-base font-semibold text-[var(--color-text-primary)]"
          >
            {strings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.close}
            className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {strings.intro}
        </p>

        <CopyField
          label={strings.endpointLabel}
          value={endpoint}
          copy={strings.copy}
          copied={strings.copied}
        />

        <div className="flex flex-col gap-1.5">
          <span className={SECTION_LABEL_CLASS} style={{ letterSpacing: "0.28em" }}>
            {strings.configLabel}
          </span>
          <CodeBlock value={config} copy={strings.copy} copied={strings.copied} />
          <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            {strings.configNote}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL_CLASS} style={{ letterSpacing: "0.28em" }}>
            {strings.toolsTitle}
          </span>
          <ul className="flex flex-col gap-1.5">
            {strings.tools.map((tool) => (
              <li
                key={tool.name}
                className="text-xs leading-relaxed text-[var(--color-text-secondary)]"
              >
                <code className="font-mono text-[var(--color-accent)]">{tool.name}</code>
                {" — "}
                {tool.desc}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function useCopied(): { copied: boolean; trigger: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const trigger = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, trigger };
}

function CopyButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
      style={{ letterSpacing: "0.18em" }}
    >
      {label}
    </button>
  );
}

function CopyField({
  label,
  value,
  copy,
  copied: copiedLabel,
}: {
  label: string;
  value: string;
  copy: string;
  copied: string;
}) {
  const { copied, trigger } = useCopied();
  return (
    <div className="flex flex-col gap-1.5">
      <span className={SECTION_LABEL_CLASS} style={{ letterSpacing: "0.28em" }}>
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/40 p-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-[var(--color-text-primary)]">
          {value}
        </code>
        <CopyButton onClick={() => trigger(value)} label={copied ? copiedLabel : copy} />
      </div>
    </div>
  );
}

function CodeBlock({
  value,
  copy,
  copied: copiedLabel,
}: {
  value: string;
  copy: string;
  copied: string;
}) {
  const { copied, trigger } = useCopied();
  return (
    <div className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/40">
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-[var(--color-text-primary)]">
        {value}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton onClick={() => trigger(value)} label={copied ? copiedLabel : copy} />
      </div>
    </div>
  );
}

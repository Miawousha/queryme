"use client";

import { useState } from "react";

function buildPrompt(username: string, origin: string): string {
  return [
    `I'm setting up my Queritae knowledge base — a queryable CV that will live at ${origin}/${username}.`,
    "",
    `Fetch ${origin}/setup-guide.md and follow it exactly. Ask me for my source material (CV, LinkedIn export, portfolio links), and interview me briefly to fill gaps and capture stories. When everything passes the guide's self-checks, create a public GitHub repo, push, and give me the repo URL to paste back here.`,
  ].join("\n");
}

// Empty-state onboarding for the Content tab: the quickest path to a KB is
// letting a coding agent build the content repo. Rendered only client-side
// (ContentTab shows it after its initial fetch), so window is available.
export function KbSetupSteps({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const prompt = buildPrompt(username, window.location.origin);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
        Set up your knowledge base
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        The quickest way to build your KB is to let a coding agent do it —
        Claude Code, or any assistant that can fetch a URL and push to GitHub.
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          <span className="font-medium">Copy this prompt</span> into your
          coding agent.
          <div className="mt-2 rounded border border-[var(--color-border)] p-2">
            <pre
              data-testid="setup-prompt"
              className="whitespace-pre-wrap font-sans text-xs text-[var(--color-text-secondary)]"
            >
              {prompt}
            </pre>
            <button
              type="button"
              onClick={copy}
              className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
        </li>
        <li>
          <span className="font-medium">The agent builds your content repo</span>{" "}
          from your CV plus a short interview, and pushes it to GitHub (public).
        </li>
        <li>
          <span className="font-medium">Paste the repo URL below and Sync.</span>{" "}
          If the sync fails, paste the error back into your agent.
        </li>
      </ol>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Prefer to write it by hand?{" "}
        <a
          href="/setup-guide.md"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Read the setup guide
        </a>
        .
      </p>
    </div>
  );
}

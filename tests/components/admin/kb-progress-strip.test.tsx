import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KbProgressStrip } from "@/components/admin/kb-progress-strip";
import type { PersonaSource } from "@/lib/db/schema";

const ACTIVE = {
  id: "ps1",
  repoUrl: "https://github.com/alex/queritae-content",
  branch: "main",
  commitSha: "abc1234",
  status: "ok",
  error: null,
  syncedAt: "2026-06-12T00:00:00.000Z",
} as unknown as PersonaSource;

function currentStepName(): string | null {
  const el = document.querySelector('[aria-current="step"]');
  return el?.textContent?.trim() ?? null;
}

describe("KbProgressStrip", () => {
  it("marks 'build repo' as the current step for a brand-new account", () => {
    render(<KbProgressStrip active={null} historyCount={0} />);
    expect(currentStepName()).toMatch(/build/i);
    expect(screen.queryByText(/knowledge base is live/i)).not.toBeInTheDocument();
  });

  it("advances to 'first sync' once a repo is connected but no sync has succeeded", () => {
    render(<KbProgressStrip active={null} historyCount={2} />);
    expect(currentStepName()).toMatch(/first sync/i);
    expect(screen.queryByText(/knowledge base is live/i)).not.toBeInTheDocument();
  });

  it("shows the complete state and no current step once a source is live", () => {
    render(<KbProgressStrip active={ACTIVE} historyCount={3} />);
    expect(currentStepName()).toBeNull();
    expect(screen.getByText(/knowledge base is live/i)).toBeInTheDocument();
  });
});

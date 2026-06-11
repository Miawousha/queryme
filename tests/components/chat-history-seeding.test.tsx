/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { mswServer } from "../../vitest.setup";
import { Chat } from "@/components/chat";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";
import { buildUiStrings } from "@/lib/language";
import type { Persona } from "@/lib/persona";
import type { ConversationTurn } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Harness: real <Chat>, mocked KB context, msw-served history endpoint.
// jsdom has no fetch of its own — Node's fetch needs absolute URLs, so the
// test passes an absolute apiBasePath (a prop the component already takes).
// ---------------------------------------------------------------------------

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const API_BASE = "http://localhost/api/a/fixture";
const HISTORY_URL = `${API_BASE}/chat/history`;
const STORED_ID = "11111111-2222-4333-8444-555555555555";

const ALEX: Persona = {
  id: "alex-collet",
  fullName: "Alexandre Collet",
  givenName: "Alexandre",
  defaultLocale: "en",
  i18n: {
    en: { possessive: "his", objectPronoun: "him", subjectPronoun: "he" },
    fr: { possessive: "son", objectPronoun: "le", subjectPronoun: "il", givenWithApostrophe: "d'Alexandre" },
  },
};
const T = buildUiStrings(ALEX).en;

const TURNS: ConversationTurn[] = [
  { role: "user", text: "What did you build at ION?", at: "2026-06-10T10:00:00.000Z" },
  {
    role: "assistant",
    text: "A battery management platform. [^kb:experience/ion.md#battery-os]",
    at: "2026-06-10T10:00:05.000Z",
  },
];

function serveHistory(response: () => Response) {
  const requested: URL[] = [];
  mswServer.use(
    http.get(HISTORY_URL, ({ request }) => {
      requested.push(new URL(request.url));
      return response();
    }),
  );
  return requested;
}

function renderChat(ctx = makeKbContext(), onLangChange = vi.fn()) {
  vi.mocked(useKb).mockReturnValue(ctx);
  render(<Chat t={T} lang="en" onLangChange={onLangChange} apiBasePath={API_BASE} />);
  return { ctx, onLangChange };
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  window.localStorage.clear();
  window.localStorage.setItem("queritae:conversationId", STORED_ID);
  // jsdom has no matchMedia. StreamingMessage queries prefers-reduced-motion;
  // answering `matches: true` also skips its rAF reveal loop, so seeded text
  // renders in full immediately — exactly what these assertions need.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

describe("Chat — history rehydration", () => {
  it("seeds the stored transcript, adopts the language, and mutes seeded pulses", async () => {
    const requested = serveHistory(() =>
      HttpResponse.json({ conversationId: STORED_ID, language: "fr", turns: TURNS }),
    );
    const { ctx, onLangChange } = renderChat();

    // The visible thread is back…
    expect(await screen.findByText("What did you build at ION?")).toBeInTheDocument();
    // …the intro stays (it renders outside useChat messages)…
    expect(screen.getByText(T.intro)).toBeInTheDocument();
    // …and the starter chips are gone (the thread is no longer empty).
    expect(screen.queryByText(T.starters[0])).not.toBeInTheDocument();

    // The fetch carried the stored id.
    expect(requested[0]?.searchParams.get("conversationId")).toBe(STORED_ID);

    // Sticky language adopted from the conversation row.
    expect(onLangChange).toHaveBeenCalledWith("fr");

    // Pulse suppression: the seeded citation key was marked seen BEFORE the
    // tree's auto-reveal effect could observe it…
    expect(ctx.seenAutoReveal.current.has("experience/ion.md#battery-os")).toBe(true);
    expect(ctx.seenAutoReveal.current.size).toBe(1);

    // …while the chips flow is untouched: citedRefs still receives the ref.
    await waitFor(() => {
      const lastCall = vi.mocked(ctx.setCitedRefs).mock.calls.at(-1);
      expect(lastCall?.[0]).toEqual([
        expect.objectContaining({ path: "experience/ion.md", anchor: "battery-os", index: 1 }),
      ]);
    });
  });

  it("404 → clears the stored id and starts fresh, silently", async () => {
    serveHistory(() => HttpResponse.json({ error: "Not found." }, { status: 404 }));
    renderChat();

    await waitFor(() => {
      const id = window.localStorage.getItem("queritae:conversationId");
      expect(id).not.toBe(STORED_ID);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
    // Fresh, empty thread: starters visible, no error surfaced.
    expect(screen.getByText(T.starters[0])).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("network failure → starts fresh but KEEPS the stored id for a later retry", async () => {
    const requested = serveHistory(() => HttpResponse.error());
    renderChat();

    await waitFor(() => expect(requested).toHaveLength(1));
    expect(window.localStorage.getItem("queritae:conversationId")).toBe(STORED_ID);
    expect(screen.getByText(T.starters[0])).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

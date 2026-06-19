/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { mswServer } from "../../vitest.setup";
import { Chat } from "@/components/chat";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";
import { buildUiStrings } from "@/lib/language";
import type { Persona } from "@/lib/persona";
import type { ConversationTurn } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Harness mirrors chat-history-seeding.test.tsx: real <Chat>, mocked KB
// context, msw-served history endpoint, absolute apiBasePath (jsdom fetch
// needs absolute URLs).
// ---------------------------------------------------------------------------

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const API_BASE = "http://localhost/api/a/fixture";
const HISTORY_URL = `${API_BASE}/chat/history`;
const STORED_ID = "11111111-2222-4333-8444-555555555555";
const ID_KEY = `queritae:conversationId:${API_BASE}`;

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
  { role: "assistant", text: "A battery management platform.", at: "2026-06-10T10:00:05.000Z" },
];

function seedHistory() {
  mswServer.use(
    http.get(HISTORY_URL, () =>
      HttpResponse.json({ conversationId: STORED_ID, language: "en", turns: TURNS }),
    ),
  );
}

function renderChat() {
  vi.mocked(useKb).mockReturnValue(makeKbContext());
  render(<Chat t={T} lang="en" onLangChange={vi.fn()} apiBasePath={API_BASE} />);
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  window.localStorage.clear();
  window.localStorage.setItem(ID_KEY, STORED_ID);
  // jsdom has no matchMedia; StreamingMessage queries prefers-reduced-motion.
  // matches:true also skips its rAF reveal so seeded text renders immediately.
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

describe("Chat — clear chat", () => {
  it("no clear control while the thread is empty", async () => {
    // First-time visitor: empty store, no history fetch, empty thread.
    window.localStorage.clear();
    renderChat();

    await waitFor(() => expect(screen.getByText(T.starters[0])).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: T.clearChat.action })).not.toBeInTheDocument();
  });

  it("a single click only asks for confirmation — it does not clear", async () => {
    seedHistory();
    renderChat();
    expect(await screen.findByText("What did you build at ION?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: T.clearChat.action }));

    // Confirm + cancel affordances appear; the thread is untouched.
    expect(screen.getByRole("button", { name: T.clearChat.confirm })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.clearChat.cancel })).toBeInTheDocument();
    expect(screen.getByText("What did you build at ION?")).toBeInTheDocument();
    expect(window.localStorage.getItem(ID_KEY)).toBe(STORED_ID);
  });

  it("cancel backs out of the confirm without clearing", async () => {
    seedHistory();
    renderChat();
    expect(await screen.findByText("What did you build at ION?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: T.clearChat.action }));
    fireEvent.click(screen.getByRole("button", { name: T.clearChat.cancel }));

    // Back to the single trigger; thread and id intact.
    expect(screen.getByRole("button", { name: T.clearChat.action })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T.clearChat.confirm })).not.toBeInTheDocument();
    expect(screen.getByText("What did you build at ION?")).toBeInTheDocument();
    expect(window.localStorage.getItem(ID_KEY)).toBe(STORED_ID);
  });

  it("confirming empties the thread, restores starters, and rotates the stored id", async () => {
    seedHistory();
    renderChat();
    expect(await screen.findByText("What did you build at ION?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: T.clearChat.action }));
    fireEvent.click(screen.getByRole("button", { name: T.clearChat.confirm }));

    // Thread gone, starters back (empty thread), clear control retired.
    await waitFor(() =>
      expect(screen.queryByText("What did you build at ION?")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(T.starters[0])).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T.clearChat.action })).not.toBeInTheDocument();

    // The stored id rotated to a fresh uuid so a reload won't rehydrate it.
    const id = window.localStorage.getItem(ID_KEY);
    expect(id).not.toBe(STORED_ID);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("clearing dismisses a stale error banner along with the thread", async () => {
    // First-time visitor: a failed send leaves an error banner + the
    // optimistic user message, so the clear control is available.
    window.localStorage.clear();
    renderChat();
    await waitFor(() => expect(screen.getByText(T.starters[0])).toBeInTheDocument());

    mswServer.use(
      http.post(`${API_BASE}/chat`, () => HttpResponse.json({ error: "down" }, { status: 500 })),
    );
    fireEvent.change(screen.getByPlaceholderText(T.placeholder), {
      target: { value: "Tell me about ION" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(T.placeholder), { key: "Enter" });
    expect(await screen.findByText("Tell me about ION")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: T.clearChat.action }));
    fireEvent.click(screen.getByRole("button", { name: T.clearChat.confirm }));

    // The thread is gone and the now-stale banner went with it.
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText(T.starters[0])).toBeInTheDocument();
  });
});

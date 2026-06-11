/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const CHAT_URL = `${API_BASE}/chat`;
const STORED_ID = "11111111-2222-4333-8444-555555555555";
// Conversation ids are stored per account page, keyed by the apiBasePath the
// hook receives — a visitor's thread with persona A must never leak into a
// chat POST against persona B.
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

/**
 * History endpoint held open until `release()` — deterministic stand-in for a
 * slow round-trip, so a test can interleave visitor activity with the fetch.
 * `settled()` flips once the handler has produced its response.
 */
function serveGatedHistory(response: () => Response) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let settled = false;
  mswServer.use(
    http.get(HISTORY_URL, async () => {
      await gate;
      settled = true;
      return response();
    }),
  );
  return { release, settled: () => settled };
}

/**
 * Drive the real submit flow (Enter in the textarea → sendMessage). The chat
 * POST is served a 500, so the optimistic user message stays in the thread and
 * `status` leaves "ready" — exactly the non-empty/non-idle state the history
 * guards read. Returns the captured POST bodies for conversation-id assertions.
 */
async function submitVisitorMessage(text: string, chatUrl = CHAT_URL) {
  const bodies: { conversationId?: string }[] = [];
  mswServer.use(
    http.post(chatUrl, async ({ request }) => {
      bodies.push((await request.json()) as { conversationId?: string });
      return HttpResponse.json({ error: "down" }, { status: 500 });
    }),
  );
  fireEvent.change(screen.getByPlaceholderText(T.placeholder), { target: { value: text } });
  fireEvent.keyDown(screen.getByPlaceholderText(T.placeholder), { key: "Enter" });
  expect(await screen.findByText(text)).toBeInTheDocument();
  await waitFor(() => expect(bodies).toHaveLength(1));
  return bodies;
}

/** Let the client finish processing a response the gated handler just sent. */
function flushClient() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 30)));
}

function renderChat(ctx = makeKbContext(), onLangChange = vi.fn(), apiBase = API_BASE) {
  vi.mocked(useKb).mockReturnValue(ctx);
  const view = render(<Chat t={T} lang="en" onLangChange={onLangChange} apiBasePath={apiBase} />);
  return { ctx, onLangChange, unmount: view.unmount };
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  window.localStorage.clear();
  window.localStorage.setItem(ID_KEY, STORED_ID);
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
    serveHistory(() => HttpResponse.json({ error: "Not found" }, { status: 404 }));
    renderChat();

    await waitFor(() => {
      const id = window.localStorage.getItem(ID_KEY);
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
    expect(window.localStorage.getItem(ID_KEY)).toBe(STORED_ID);
    expect(screen.getByText(T.starters[0])).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("first-time visitor (empty localStorage) → NO history request fires", async () => {
    // Override the beforeEach seed: start with a truly empty store.
    window.localStorage.clear();

    // Register a sentinel handler. If a history fetch arrives it records the
    // hit; the assertion below makes the expectation explicit. The global
    // onUnhandledRequest: "error" would already surface a stray request as a
    // test failure, but an explicit spy makes the intent unambiguous.
    const historyHits: string[] = [];
    mswServer.use(
      http.get(HISTORY_URL, ({ request }) => {
        historyHits.push(request.url);
        return HttpResponse.json({ error: "unexpected" }, { status: 500 });
      }),
    );

    renderChat();

    // Wait for the component to settle: starters visible = init effect done.
    await waitFor(() => expect(screen.getByText(T.starters[0])).toBeInTheDocument());

    // Explicit assertion: the history endpoint was never called.
    expect(historyHits).toHaveLength(0);
  });
});

describe("Chat — history fetch racing a visitor message", () => {
  it("does not clobber a thread the visitor started while the fetch was in flight", async () => {
    const history = serveGatedHistory(() =>
      HttpResponse.json({ conversationId: STORED_ID, language: "fr", turns: TURNS }),
    );
    const { onLangChange } = renderChat();

    await submitVisitorMessage("Hello, tell me about Alexandre");

    history.release();
    await waitFor(() => expect(history.settled()).toBe(true));
    await flushClient();

    // The visitor's thread is intact; the stored transcript never seeded.
    expect(screen.getByText("Hello, tell me about Alexandre")).toBeInTheDocument();
    expect(screen.queryByText("What did you build at ION?")).not.toBeInTheDocument();
    // The guard returns before language adoption — the seed path's first
    // side effect — so a clobber would surface here as a "fr" call.
    expect(onLangChange).not.toHaveBeenCalled();
  });

  it("delayed 404 + visitor already chatting → the stored id is NOT swapped", async () => {
    const history = serveGatedHistory(() =>
      HttpResponse.json({ error: "Not found" }, { status: 404 }),
    );
    renderChat();

    await submitVisitorMessage("Hello, tell me about Alexandre");

    history.release();
    await waitFor(() => expect(history.settled()).toBe(true));
    await flushClient();

    // The visitor's POST already created the conversation under the stored
    // id; re-keying on the late 404 would split the server transcript.
    expect(window.localStorage.getItem(ID_KEY)).toBe(STORED_ID);
    expect(screen.getByText("Hello, tell me about Alexandre")).toBeInTheDocument();
  });
});

describe("Chat — conversation-id namespacing per account", () => {
  const API_BASE_B = "http://localhost/api/a/other";

  it("an id minted on one persona's page does not leak into another persona's chat POST", async () => {
    window.localStorage.clear();
    // If the id DOES leak, persona B's mount sees it as "existing" and fetches
    // history for it; serve a network error so the hook keeps the id (the 404
    // branch would rotate it and mask the leak).
    mswServer.use(http.get(`${API_BASE_B}/chat/history`, () => HttpResponse.error()));

    const pageA = renderChat();
    const aBodies = await submitVisitorMessage("Hello from A's page");
    const idOnA = aBodies[0]?.conversationId;
    expect(idOnA).toMatch(/^[0-9a-f-]{36}$/);
    pageA.unmount();

    renderChat(makeKbContext(), vi.fn(), API_BASE_B);
    const bBodies = await submitVisitorMessage("Hello from B's page", `${API_BASE_B}/chat`);
    const idOnB = bBodies[0]?.conversationId;
    expect(idOnB).toMatch(/^[0-9a-f-]{36}$/);

    // The collision under test: B's POST carrying A's id is what the server
    // rejects as a foreign-account conversation (a visitor-facing 500).
    expect(idOnB).not.toBe(idOnA);

    // Each page keeps its own id under its own key.
    expect(window.localStorage.getItem(ID_KEY)).toBe(idOnA);
    expect(window.localStorage.getItem(`queritae:conversationId:${API_BASE_B}`)).toBe(idOnB);
  });

  it("adopts the pre-namespacing global key once, then retires it", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("queritae:conversationId", STORED_ID);
    const requested = serveHistory(() =>
      HttpResponse.json({ conversationId: STORED_ID, language: "en", turns: TURNS }),
    );
    renderChat();

    // The migrated id still rehydrates its transcript…
    expect(await screen.findByText("What did you build at ION?")).toBeInTheDocument();
    expect(requested[0]?.searchParams.get("conversationId")).toBe(STORED_ID);
    // …now lives under the per-account key…
    expect(window.localStorage.getItem(ID_KEY)).toBe(STORED_ID);
    // …and the global key is gone, so no other persona page can claim it
    // (a wrong first claimant self-heals through the 404 rotation above).
    expect(window.localStorage.getItem("queritae:conversationId")).toBeNull();
  });
});

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  historyCitationKeys,
  turnsToUiMessages,
  type HistoryUiMessage,
} from "@/lib/chat/history-messages";
import type { ConversationTurn } from "@/lib/db/schema";
import type { UiLang } from "@/lib/language";

const CONVERSATION_ID_KEY = "queritae:conversationId";

function loadOrCreateConversationId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CONVERSATION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(CONVERSATION_ID_KEY, id);
  }
  return id;
}

export type UseConversationHistoryArgs = {
  /** Base path for API calls, e.g. "/api" or "/api/a/<username>". */
  apiBasePath: string;
  /** `useChat`'s setMessages — receives the seeded history thread. */
  setMessages: (messages: HistoryUiMessage[]) => void;
  /**
   * Lets a rehydrated conversation pull the UI over to its sticky stored
   * language (the server answers in that language regardless of the toggle,
   * so the thread and the chrome should agree). Optional — without it the
   * thread still seeds, just without the language adoption.
   */
  onLangChange?: (next: UiLang) => void;
  /**
   * KbContext's dedup set of citation keys that already pulsed. Seeded
   * citations are marked seen here BEFORE the messages land so rehydrated
   * history doesn't trigger the tree's auto-reveal pulse.
   */
  seenAutoReveal: RefObject<Set<string>>;
  /**
   * Mirror of the live thread state ("still empty and idle?"), read at fetch
   * resolution time instead of capturing a stale snapshot in the closure.
   * Gates both seeding and the 404 branch's id swap.
   */
  threadStateRef: RefObject<{ empty: boolean; idle: boolean }>;
};

/**
 * Owns the conversation-id lifecycle (localStorage init, the ref the chat
 * transport reads at request time) and the one-shot history rehydration:
 * with a stored conversationId, fetch the server-side transcript once and
 * seed it into `useChat`.
 */
export function useConversationHistory({
  apiBasePath,
  setMessages,
  onLangChange,
  seenAutoReveal,
  threadStateRef,
}: UseConversationHistoryArgs): {
  conversationId: string;
  conversationIdRef: RefObject<string>;
} {
  const [conversationId, setConversationId] = useState("");
  const conversationIdRef = useRef("");
  useEffect(() => {
    const id = loadOrCreateConversationId();
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);

  // The attempt guard is a ref so the re-run triggered by the 404 branch's
  // fresh id (and any StrictMode double-invoke) doesn't fetch again — a fresh
  // id has no history anyway.
  const historyAttemptedRef = useRef(false);
  useEffect(() => {
    if (!conversationId || historyAttemptedRef.current) return;
    historyAttemptedRef.current = true;
    (async () => {
      try {
        const res = await fetch(
          `${apiBasePath}/chat/history?conversationId=${encodeURIComponent(conversationId)}`,
        );
        if (res.status === 404) {
          // Unknown, deleted, or another persona's conversation: the stored
          // id is dead weight. Drop it and start fresh — no error surfaced.
          // Same gate as the seeding below: if the visitor submitted a first
          // message during the round-trip, the chat POST already created the
          // conversation under the stored id — swapping it now would split
          // the transcript across two ids, so leave the id alone.
          if (!threadStateRef.current.empty || !threadStateRef.current.idle) return;
          const fresh = crypto.randomUUID();
          window.localStorage.setItem(CONVERSATION_ID_KEY, fresh);
          conversationIdRef.current = fresh;
          setConversationId(fresh);
          return;
        }
        // Transient failure (5xx): start fresh but KEEP the stored id — the
        // conversation may still exist, so the next reload can retry.
        if (!res.ok) return;
        const data = (await res.json()) as {
          turns?: ConversationTurn[];
          language?: UiLang | null;
        };
        // Don't clobber a thread the visitor started while we were fetching.
        if (!threadStateRef.current.empty || !threadStateRef.current.idle) return;
        // Adopt the conversation's sticky language: the server answers any
        // continuation in it no matter what the toggle says, so the UI
        // follows the thread rather than the other way around.
        if ((data.language === "en" || data.language === "fr") && onLangChange) {
          onLangChange(data.language);
        }
        const seeded = turnsToUiMessages(data.turns ?? []);
        if (seeded.length === 0) return;
        // Mute the KB tree's auto-reveal pulse for rehydrated citations by
        // marking them seen BEFORE the messages land (and independently of
        // whether the manifest has loaded). The chips still render via the
        // citedRefs flow; only genuinely new citations from post-reload
        // answers pulse.
        for (const key of historyCitationKeys(seeded)) {
          seenAutoReveal.current.add(key);
        }
        setMessages(seeded);
      } catch {
        // Network failure: same call as !res.ok — start fresh, keep the id.
      }
    })();
  }, [conversationId, apiBasePath, onLangChange, seenAutoReveal, setMessages, threadStateRef]);

  return { conversationId, conversationIdRef };
}

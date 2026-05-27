"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, type ChatMessageProps } from "@/components/chat-message";
import { nextRevealLength } from "@/lib/smooth-stream";

/**
 * Reveals `target` at a smooth, catch-up pace while `isStreaming` is true.
 *
 * A message that is never streamed (the intro, history, user messages) shows
 * in full immediately — only the message actively being streamed animates.
 */
function useSmoothStream(target: string, isStreaming: boolean): string {
  const [, forceRender] = useState(0);
  const lengthRef = useRef(0);
  const targetRef = useRef(target);
  const streamingRef = useRef(isStreaming);
  const hasStreamedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const tickRef = useRef<(ts: number) => void>(() => {});

  targetRef.current = target;
  streamingRef.current = isStreaming;
  if (isStreaming) hasStreamedRef.current = true;

  // A message that was never streamed shows in full with no animation.
  if (!isStreaming && !hasStreamedRef.current) {
    lengthRef.current = target.length;
  }

  tickRef.current = (ts: number) => {
    const ms = Math.min(ts - (lastTsRef.current ?? ts), 100);
    lastTsRef.current = ts;

    const next = nextRevealLength({
      displayedLength: lengthRef.current,
      targetLength: targetRef.current.length,
      isStreaming: streamingRef.current,
      msSinceLastFrame: ms,
    });
    if (next !== lengthRef.current) {
      lengthRef.current = next;
      forceRender((n) => n + 1);
    }

    if (lengthRef.current < targetRef.current.length) {
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
    } else {
      rafRef.current = null;
      lastTsRef.current = null;
    }
  };

  // Honor "reduce motion": skip the character-by-character reveal entirely
  // and show each message in full.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // (Re)arm the reveal loop whenever new text arrives or streaming state flips.
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (rafRef.current == null && lengthRef.current < target.length) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
    }
  }, [target, isStreaming, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return prefersReducedMotion ? target : target.slice(0, lengthRef.current);
}

export type StreamingMessageProps = Omit<ChatMessageProps, "text"> & {
  text: string;
  isStreaming: boolean;
  /** When true, suppress the bubble until there's text to show, so a parent
   *  placeholder (e.g. ThinkingIndicator) can stand in. Hooks keep running so
   *  the smooth-stream state survives the gap. */
  hideUntilText?: boolean;
};

/** Wraps `ChatMessage` with smooth, buffered streaming of the message text. */
export function StreamingMessage({
  text,
  isStreaming,
  hideUntilText,
  ...rest
}: StreamingMessageProps) {
  const displayed = useSmoothStream(text, isStreaming);
  if (hideUntilText && displayed === "") return null;
  return <ChatMessage text={displayed} {...rest} />;
}

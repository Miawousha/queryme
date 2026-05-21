/**
 * Pure pacing logic for smooth ("buffered, catch-up") text streaming.
 *
 * The chat receives text from the model in bursty network chunks. To play it
 * back fluidly, the UI reveals characters at a controlled pace that always
 * chases the true accumulated text. This module holds the frame-by-frame math;
 * `components/streaming-message.tsx` drives it with `requestAnimationFrame`.
 */

/** Characters that must accumulate before the reveal starts (~10 tokens). */
export const BUFFER_CHARS = 40;

/**
 * While streaming, the reveal stays this many characters behind the newest
 * text so motion stays continuous when the network briefly stalls.
 */
export const TAIL_LAG_CHARS = 8;

/** While streaming, aim to clear the current backlog within this many seconds. */
export const CATCHUP_SECONDS = 0.55;

/** After streaming ends, drain the remaining text within roughly this long. */
export const DRAIN_SECONDS = 0.35;

/** Floor reveal speed, so even a tiny backlog keeps moving. */
export const MIN_CHARS_PER_SEC = 40;

/** Ceiling reveal speed while streaming, so bursts don't flash in instantly. */
export const MAX_CHARS_PER_SEC = 350;

export type RevealState = {
  /** Characters currently shown. */
  displayedLength: number;
  /** Characters available in the true accumulated text. */
  targetLength: number;
  /** Whether the model is still streaming this message. */
  isStreaming: boolean;
  /** Milliseconds elapsed since the previous frame. */
  msSinceLastFrame: number;
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Given the current reveal state and the time since the last frame, return the
 * number of characters that should be shown on the next frame. The result is
 * monotonic (never goes backward) and never exceeds `targetLength`.
 */
export function nextRevealLength(state: RevealState): number {
  const { displayedLength, targetLength, isStreaming, msSinceLastFrame } = state;

  // Already showing everything (or more, after a message swap) — clamp.
  if (displayedLength >= targetLength) return targetLength;

  // Prefix buffer: while streaming, hold the reveal until a cushion of text
  // has accumulated so playback stays smooth once it starts.
  if (isStreaming && targetLength < BUFFER_CHARS) return 0;

  // While streaming, stay a small lag behind the newest characters. Once the
  // stream has ended, drain all the way to the end.
  const cap = isStreaming
    ? Math.max(0, targetLength - TAIL_LAG_CHARS)
    : targetLength;
  if (displayedLength >= cap) return displayedLength;

  // Speed scales with the backlog, so a burst is caught up quickly while a
  // near-idle stream ticks along gently.
  const backlog = targetLength - displayedLength;
  const charsPerSec = isStreaming
    ? clamp(backlog / CATCHUP_SECONDS, MIN_CHARS_PER_SEC, MAX_CHARS_PER_SEC)
    : Math.max(backlog / DRAIN_SECONDS, MIN_CHARS_PER_SEC);

  const step = Math.max(1, Math.round(charsPerSec * (msSinceLastFrame / 1000)));
  return Math.min(displayedLength + step, cap);
}

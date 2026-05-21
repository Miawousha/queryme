import { describe, it, expect } from "vitest";
import {
  nextRevealLength,
  BUFFER_CHARS,
  TAIL_LAG_CHARS,
} from "@/lib/smooth-stream";

const FRAME = 16; // ~60fps

describe("nextRevealLength", () => {
  it("holds the reveal at 0 while streaming below the prefix buffer", () => {
    expect(
      nextRevealLength({
        displayedLength: 0,
        targetLength: BUFFER_CHARS - 1,
        isStreaming: true,
        msSinceLastFrame: FRAME,
      }),
    ).toBe(0);
  });

  it("starts revealing once the prefix buffer is filled", () => {
    const next = nextRevealLength({
      displayedLength: 0,
      targetLength: 200,
      isStreaming: true,
      msSinceLastFrame: FRAME,
    });
    expect(next).toBeGreaterThan(0);
  });

  it("advances faster when the backlog is larger (catch-up)", () => {
    const small = nextRevealLength({
      displayedLength: 100,
      targetLength: 130,
      isStreaming: true,
      msSinceLastFrame: FRAME,
    });
    const large = nextRevealLength({
      displayedLength: 100,
      targetLength: 900,
      isStreaming: true,
      msSinceLastFrame: FRAME,
    });
    expect(large - 100).toBeGreaterThan(small - 100);
  });

  it("keeps a tail lag behind the newest characters while streaming", () => {
    const target = 500;
    const atCap = target - TAIL_LAG_CHARS;
    expect(
      nextRevealLength({
        displayedLength: atCap,
        targetLength: target,
        isStreaming: true,
        msSinceLastFrame: FRAME,
      }),
    ).toBe(atCap);
  });

  it("never reveals beyond the tail-lag cap while streaming", () => {
    const target = 500;
    const next = nextRevealLength({
      displayedLength: 480,
      targetLength: target,
      isStreaming: true,
      msSinceLastFrame: 1000,
    });
    expect(next).toBeLessThanOrEqual(target - TAIL_LAG_CHARS);
  });

  it("drains all the way to the end once streaming has stopped", () => {
    const next = nextRevealLength({
      displayedLength: 495,
      targetLength: 500,
      isStreaming: false,
      msSinceLastFrame: 1000,
    });
    expect(next).toBe(500);
  });

  it("ignores the prefix buffer once streaming has ended (short answers)", () => {
    const next = nextRevealLength({
      displayedLength: 0,
      targetLength: 4,
      isStreaming: false,
      msSinceLastFrame: 1000,
    });
    expect(next).toBe(4);
  });

  it("advances at least one character per frame past the buffer", () => {
    const next = nextRevealLength({
      displayedLength: 100,
      targetLength: 110,
      isStreaming: true,
      msSinceLastFrame: 1,
    });
    expect(next).toBeGreaterThanOrEqual(101);
  });

  it("clamps when already at or beyond the target", () => {
    expect(
      nextRevealLength({
        displayedLength: 50,
        targetLength: 50,
        isStreaming: true,
        msSinceLastFrame: FRAME,
      }),
    ).toBe(50);
    expect(
      nextRevealLength({
        displayedLength: 80,
        targetLength: 50,
        isStreaming: false,
        msSinceLastFrame: FRAME,
      }),
    ).toBe(50);
  });

  it("reaches the target after repeated drain frames", () => {
    let len = 0;
    const target = 300;
    for (let i = 0; i < 200 && len < target; i++) {
      len = nextRevealLength({
        displayedLength: len,
        targetLength: target,
        isStreaming: false,
        msSinceLastFrame: FRAME,
      });
    }
    expect(len).toBe(target);
  });
});

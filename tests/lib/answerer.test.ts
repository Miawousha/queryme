import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { simulateReadableStream } from "ai";
import { answer } from "@/lib/answerer";

function makeMockModel(textChunks: string[]) {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
          { type: "text-start", id: "1" },
          ...textChunks.map((t) => ({ type: "text-delta" as const, id: "1", delta: t })),
          { type: "text-end", id: "1" },
          { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        ],
      }),
    }),
  });
}

describe("answer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("streams text chunks from the model", async () => {
    const model = makeMockModel(["Hello", " world"]);
    const result = await answer({
      accountId: "local-override",
      messages: [{ role: "user", content: "Hi" }],
      kbText: "FAKE KB",
      model,
    });

    const text = await result.text;
    expect(text).toBe("Hello world");
  });

  it("sends the KB text as part of the system prompt", async () => {
    const calls: unknown[] = [];
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        calls.push(options);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({
      accountId: "local-override",
      messages: [{ role: "user", content: "Hi" }],
      kbText: "MARKER_KB_CONTENT",
      model,
    }).then((r) => r.text);

    expect(JSON.stringify(calls)).toContain("MARKER_KB_CONTENT");
  });

  it("marks the KB content for prompt caching via providerOptions", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({
      accountId: "local-override",
      messages: [{ role: "user", content: "Hi" }],
      kbText: "UNIQUE_KB_MARKER_XYZ",
      model,
    }).then((r) => r.text);

    const prompt = (captured as any).prompt as Array<any>;
    const systemMessages = prompt.filter((m) => m.role === "system");
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    const kbMessage = systemMessages.find(
      (m) => typeof m.content === "string" && m.content.includes("UNIQUE_KB_MARKER_XYZ"),
    );
    const headerMessage = systemMessages.find((m) => m !== kbMessage);
    expect(kbMessage).toBeDefined();
    expect(kbMessage.providerOptions?.anthropic?.cacheControl?.type).toBe("ephemeral");
    expect(headerMessage?.providerOptions?.anthropic?.cacheControl).toBeUndefined();
  });

  it("sends header + contract + kb as three system messages", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({ accountId: "local-override", messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);
    const prompt = (captured as any).prompt as Array<any>;
    const systemMessages = prompt.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(3);
    // The citation contract reaches the model regardless of the owner's prompt.
    expect(JSON.stringify(systemMessages)).toContain("Citations (required by the platform)");
  });

  it("caps the model's output length (maxOutputTokens) for cost control", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({ accountId: "local-override", messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);

    expect(typeof captured.maxOutputTokens).toBe("number");
    expect(captured.maxOutputTokens).toBeGreaterThan(0);
  });

  it("forwards tools to the model when provided", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    const { tool } = await import("ai");
    const { z } = await import("zod");
    const tools = {
      my_tool: tool({
        description: "d",
        inputSchema: z.object({ x: z.string() }),
        execute: async () => ({ ok: true }),
      }),
    };

    await answer({
      accountId: "local-override",
      messages: [{ role: "user", content: "Hi" }],
      kbText: "KB",
      model,
      tools,
    }).then((r) => r.text);

    expect(captured.tools).toBeDefined();
    expect(captured.tools.length).toBe(1);
  });

  it("sends no tools when none are provided", async () => {
    let captured: any = null;
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        captured = options;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "response-metadata", id: "id-1", timestamp: new Date(0), modelId: "mock" },
              { type: "text-start", id: "1" },
              { type: "text-delta", id: "1", delta: "ok" },
              { type: "text-end", id: "1" },
              { type: "finish", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    });

    await answer({ accountId: "local-override", messages: [{ role: "user", content: "Hi" }], kbText: "KB", model }).then((r) => r.text);

    expect(captured.tools === undefined || captured.tools.length === 0).toBe(true);
  });
});

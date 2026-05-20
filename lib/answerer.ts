import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPromptParts } from "./prompts";

export type AnswerInput = {
  messages: ModelMessage[];
  kbText: string;
  model?: LanguageModel;
};

const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

// Pin the Anthropic base URL so we ignore stray shell-exported `ANTHROPIC_BASE_URL`
// values (e.g. Claude Desktop exports one without the `/v1` suffix, which 404s
// the SDK's request path). Override via `ANTHROPIC_BASE_URL` in `.env.local` if
// you ever need to proxy.
const anthropicProvider = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL?.includes("/v1")
    ? process.env.ANTHROPIC_BASE_URL
    : "https://api.anthropic.com/v1",
});

export async function answer(input: AnswerInput) {
  const model = input.model ?? anthropicProvider(DEFAULT_MODEL_ID);
  const parts = buildSystemPromptParts({ kbText: input.kbText });

  // AI SDK 5 `SystemModelMessage.content` is a string, so we send two system
  // messages: the small, stable header (uncached on its own breakpoint) and the
  // large KB blob, which carries an `ephemeral` cache breakpoint so Anthropic
  // caches the entire prefix up to and including it. After the first request,
  // subsequent ones hit the cache and only pay the user/assistant turns.
  const systemMessages: ModelMessage[] = [
    { role: "system", content: parts[0].text },
    {
      role: "system",
      content: parts[1].text,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
  ];

  return streamText({
    model,
    messages: [...systemMessages, ...input.messages],
    temperature: 0.3,
  });
}

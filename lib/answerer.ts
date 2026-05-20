import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPromptParts } from "./prompts";

export type AnswerInput = {
  messages: ModelMessage[];
  kbText: string;
  sensitiveKbText?: string;
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
  const parts = buildSystemPromptParts({
    kbText: input.kbText,
    sensitiveKbText: input.sensitiveKbText,
  });

  // header: uncached.
  // kb: cached with `ephemeral` breakpoint. Anthropic caches the entire prefix
  //     up to and including this breakpoint (header + kb).
  // sensitive (optional): appended AFTER the cache breakpoint. Not cached, so
  //     unverified askers (no sensitive) still hit the same cache as everyone
  //     else, and the cache isn't invalidated by toggling sensitive on/off.
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
  if (parts[2]) {
    systemMessages.push({ role: "system", content: parts[2].text });
  }

  return streamText({
    model,
    messages: [...systemMessages, ...input.messages],
    temperature: 0.3,
  });
}

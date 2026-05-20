import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/client";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText, assembleSensitiveKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import { isConversationUnlocked } from "@/lib/identity/tokens";
import { forwardQuestion } from "@/lib/questions/repo";
import { requestIdentification, verifyIdentification } from "@/lib/identity/service";
import { sendVerificationCode } from "@/lib/identity/resend";
import {
  handleAsk,
  handleForwardQuestion,
  handleRequestIdentification,
  handleVerifyIdentification,
  AskInputSchema,
  ForwardQuestionInputSchema,
  RequestIdentificationInputSchema,
  VerifyIdentificationInputSchema,
} from "@/lib/mcp/tools";

// Public KB text is immutable for the process lifetime — load once.
let cachedPublicKbText: string | null = null;

async function loadPublicKbText(): Promise<string> {
  if (cachedPublicKbText !== null) return cachedPublicKbText;
  const kb = await loadKb(path.resolve(process.cwd(), "kb"));
  cachedPublicKbText = assemblePublicKbText(kb);
  return cachedPublicKbText;
}

async function loadSensitiveKbText(): Promise<string> {
  const kb = await loadKb(path.resolve(process.cwd(), "kb"));
  return assembleSensitiveKbText(kb.sensitive);
}

// Wrap a handler result object into a standard MCP tool result: JSON text
// content, with `isError` set when the handler reports a failure.
function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError,
  };
}

// Map a thrown error (e.g. zod validation failure) into an MCP tool error.
function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return jsonResult({ ok: false, error: message }, true);
}

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "queryme", version: "1.0.0" },
    {
      instructions:
        "queryme exposes a candidate's CV as an interactive agent. Use `ask` for " +
        "questions about public CV content; reuse the returned conversationId on " +
        "follow-ups. To access sensitive content (salary, references, private " +
        "contact), call `request_identification` with the principal's work email, " +
        "then `verify_identification` with the 6-digit code they receive. Use " +
        "`forward_question` to leave a question for the candidate to answer later.",
    },
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the CV agent",
      description:
        "Ask a question about the candidate. Returns the full answer and a " +
        "conversationId — pass that conversationId back on follow-up calls to " +
        "keep context. Sensitive content is only included after identification.",
      inputSchema: AskInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleAsk(
          {
            db: getDb(),
            kv: getKv(),
            getOrCreateConversation,
            appendTurn,
            isConversationUnlocked,
            loadPublicKbText,
            loadSensitiveKbText,
            produceAnswer: async ({ messages, kbText, sensitiveKbText }) => {
              const streamed = await answer({ messages, kbText, sensitiveKbText });
              return await streamed.text;
            },
          },
          args,
        );
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "request_identification",
    {
      title: "Request identification",
      description:
        "Send a 6-digit verification code to the principal's work email so the " +
        "conversation can be unlocked for sensitive content. Free-email domains " +
        "are rejected.",
      inputSchema: RequestIdentificationInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleRequestIdentification(
          {
            db: getDb(),
            kv: getKv(),
            requestIdentification,
            send: sendVerificationCode,
          },
          args,
        );
        return jsonResult(result, !result.ok);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "verify_identification",
    {
      title: "Verify identification",
      description:
        "Submit the 6-digit code the principal received by email. On success the " +
        "conversation is unlocked and subsequent `ask` calls include sensitive content.",
      inputSchema: VerifyIdentificationInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleVerifyIdentification(
          { db: getDb(), kv: getKv(), verifyIdentification },
          args,
        );
        return jsonResult(result, !result.ok);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "forward_question",
    {
      title: "Forward a question to the candidate",
      description:
        "Leave a question for the candidate to answer later. Returns the queued " +
        "question id.",
      inputSchema: ForwardQuestionInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleForwardQuestion({ db: getDb(), forwardQuestion }, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}

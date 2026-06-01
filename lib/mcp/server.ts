import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "@/lib/db/client";
import { getCachedKb, getCachedPublicKbText } from "@/lib/kb/cache";
import { answer } from "@/lib/answerer";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import { forwardQuestion } from "@/lib/questions/repo";
import { setInterviewer } from "@/lib/interviewer/repo";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
import { buildKbLookupTools } from "@/lib/kb/tools";
import {
  handleAsk,
  handleForwardQuestion,
  AskInputSchema,
  ForwardQuestionInputSchema,
} from "@/lib/mcp/tools";

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

export function buildMcpServer(accountId: string): McpServer {
  const server = new McpServer(
    { name: "queryme", version: "1.0.0" },
    {
      instructions:
        "queryme exposes a candidate's CV as an interactive agent. Use `ask` for " +
        "questions about public CV content; reuse the returned conversationId on " +
        "follow-ups. Use `forward_question` to leave a question for the candidate " +
        "to answer later.",
    },
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the CV agent",
      description:
        "Ask a question about the candidate. Returns the full answer and a " +
        "conversationId — pass that conversationId back on follow-up calls to " +
        "keep context.",
      inputSchema: AskInputSchema.shape,
    },
    async (args) => {
      try {
        const result = await handleAsk(
          {
            db: getDb(),
            // Inject this account's id so MCP `ask` conversations are scoped
            // to it (the callback's input type omits accountId).
            getOrCreateConversation: (db, input) =>
              getOrCreateConversation(db, { ...input, accountId }),
            appendTurn,
            loadPublicKbText: () => getCachedPublicKbText(accountId),
            produceAnswer: async ({ messages, kbText, conversationId }) => {
              const parsedKb = await getCachedKb(accountId);
              const streamed = await answer({
                accountId,
                messages,
                kbText,
                tools: {
                  ...buildIdentifyTools((identity) =>
                    setInterviewer(getDb(), conversationId, identity),
                  ),
                  ...buildKbLookupTools(parsedKb),
                },
              });
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

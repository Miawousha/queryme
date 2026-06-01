import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { getPersonaStore } from "@/lib/persona/store";
import { resolveRootAccountId } from "@/lib/accounts/root";

export const runtime = "nodejs";

// One transport + server pair per MCP session. The SDK's
// `WebStandardStreamableHTTPServerTransport` tracks exactly ONE session per
// instance (`sessionId` is a scalar, not a map), so a single shared transport
// cannot serve multiple clients: the second `initialize` would be rejected,
// and a `DELETE` would tear down everyone's stream.
//
// The correct pattern (used by every stateful SDK example) is a
// `sessionId -> transport` map: a fresh transport is created on each
// `initialize` request, registered via `onsessioninitialized`, and removed on
// session close. Follow-up requests carry the `mcp-session-id` header and are
// routed back to their own transport.
//
// `WebStandardStreamableHTTPServerTransport` is the Web-native variant of the
// Streamable-HTTP transport: its `handleRequest` consumes a Web `Request` and
// returns a Web `Response`, which is exactly what Next.js App Router routes
// deal in — so no Node `IncomingMessage`/`ServerResponse` shim is needed.
/** Evict a session whose most recent request is older than this. */
const SESSION_IDLE_MS = 10 * 60 * 1000;
/** Hard ceiling on concurrent sessions — a backstop against unbounded growth. */
const MAX_SESSIONS = 100;

type Session = {
  transport: WebStandardStreamableHTTPServerTransport;
  lastActivity: number;
};
const sessions = new Map<string, Session>();

/**
 * Drop sessions that have gone idle. MCP clients frequently vanish without
 * sending a clean DELETE, so without this the map — and the McpServer
 * instances connected to each transport — would grow without bound. Called
 * lazily on every request; no background timer (serverless-friendly).
 */
function sweepIdleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_MS) {
      sessions.delete(id);
      void session.transport.close();
    }
  }
}

// Rate limit MCP traffic by IP. The limit is generous — a single agent issues
// many JSON-RPC messages per session — and exists to stop abuse, not normal use.
async function rateLimited(req: NextRequest): Promise<boolean> {
  const result = await checkRateLimit(getKv(), {
    key: `mcp:ip:${requestIp(req)}`,
    limit: 120,
    windowSeconds: 60,
  });
  return !result.allowed;
}

function jsonRpcError(code: number, message: string, status: number): Response {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code, message }, id: null },
    { status },
  );
}

// Apply IP rate limiting, then route the Web Request to the per-session
// transport (creating one on `initialize`). accountId is required when a new
// session may be initialized (POST); for DELETE (session teardown only) it is
// unused and may be omitted.
async function handle(req: NextRequest, accountId?: string): Promise<Response> {
  if (await rateLimited(req)) {
    return jsonRpcError(-32000, "Rate limit exceeded. Try again shortly.", 429);
  }

  sweepIdleSessions();

  try {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined;

    // Existing session: route straight to its transport.
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      return session.transport.handleRequest(req);
    }

    // New session: only a POST carrying an `initialize` request may create one.
    // A Web `Request` body can only be read once, so we parse it here and hand
    // the parsed body to the transport via `parsedBody`.
    if (req.method === "POST") {
      let body: unknown;
      try {
        body = JSON.parse(await req.text());
      } catch {
        return jsonRpcError(-32700, "Parse error: invalid JSON body", 400);
      }

      if (isInitializeRequest(body)) {
        if (sessions.size >= MAX_SESSIONS) {
          return jsonRpcError(-32000, "Server busy: too many active sessions.", 503);
        }
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            // Register here (not after handleRequest) so follow-up requests
            // that race in immediately after init find the transport.
            sessions.set(id, { transport, lastActivity: Date.now() });
          },
          onsessionclosed: (id) => {
            sessions.delete(id);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };

        if (!accountId) {
          return jsonRpcError(-32603, "Internal error: missing account context", 500);
        }
        const server = buildMcpServer(accountId);
        await server.connect(transport);
        return transport.handleRequest(req, { parsedBody: body });
      }

      return jsonRpcError(-32000, "Bad Request: No valid session ID provided", 400);
    }

    // GET/DELETE without a known session id: never an initialize request.
    return jsonRpcError(-32000, "Bad Request: No valid session ID provided", 400);
  } catch (err) {
    console.error("mcp: request handling failed", err);
    return jsonRpcError(-32603, "Internal error", 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  if (!getPersonaStore().getRoot(accountId)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "persona_not_configured" },
        id: null,
      },
      { status: 503 },
    );
  }
  return handle(req, accountId);
}

export async function GET(req: NextRequest): Promise<Response> {
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  if (!getPersonaStore().getRoot(accountId)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "persona_not_configured" },
        id: null,
      },
      { status: 503 },
    );
  }
  return handle(req, accountId);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}

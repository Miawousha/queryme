import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

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
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Rate limit MCP traffic by IP. The limit is generous — a single agent issues
// many JSON-RPC messages per session — and exists to stop abuse, not normal use.
async function rateLimited(req: NextRequest): Promise<boolean> {
  const kv = getKv();
  const result = await checkRateLimit(kv, {
    key: `mcp:ip:${clientIp(req)}`,
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
// transport (creating one on `initialize`).
async function handle(req: NextRequest): Promise<Response> {
  if (await rateLimited(req)) {
    return jsonRpcError(-32000, "Rate limit exceeded. Try again shortly.", 429);
  }

  try {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined;

    // Existing session: route straight to its transport.
    if (sessionId && transports.has(sessionId)) {
      return transports.get(sessionId)!.handleRequest(req);
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
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            // Register here (not after handleRequest) so follow-up requests
            // that race in immediately after init find the transport.
            transports.set(id, transport);
          },
          onsessionclosed: (id) => {
            transports.delete(id);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };

        const server = buildMcpServer();
        await server.connect(transport);
        return transport.handleRequest(req, { parsedBody: body });
      }

      return jsonRpcError(-32000, "Bad Request: No valid session ID provided", 400);
    }

    // GET/DELETE without a known session id: never an initialize request.
    return jsonRpcError(-32000, "Bad Request: No valid session ID provided", 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonRpcError(-32603, message, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";

export const runtime = "nodejs";

// One transport + server pair per process. The MCP session is identified by
// the `mcp-session-id` header the transport assigns on initialization; we keep
// a single server instance and let the transport manage sessions.
//
// `WebStandardStreamableHTTPServerTransport` is the Web-native variant of the
// Streamable-HTTP transport: its `handleRequest` consumes a Web `Request` and
// returns a Web `Response`, which is exactly what Next.js App Router routes
// deal in — so no Node `IncomingMessage`/`ServerResponse` shim is needed.
let transportPromise: Promise<WebStandardStreamableHTTPServerTransport> | null = null;

async function getTransport(): Promise<WebStandardStreamableHTTPServerTransport> {
  if (transportPromise) return transportPromise;
  transportPromise = (async () => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = buildMcpServer();
    await server.connect(transport);
    return transport;
  })();
  return transportPromise;
}

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

// Apply IP rate limiting, then hand the Web Request straight to the transport.
async function handle(req: NextRequest): Promise<Response> {
  if (await rateLimited(req)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded. Try again shortly." },
        id: null,
      },
      { status: 429 },
    );
  }

  const transport = await getTransport();
  return transport.handleRequest(req);
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
